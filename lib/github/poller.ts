/**
 * Polling-based GitHub ingestion, the safety net for the webhook.
 *
 * For each included repo it reads the repo's own events feed (the user feed returns almost nothing)
 * and the default branch's commits, and stores what the webhook may have missed. Events are left
 * unposted so the hourly digest sends them. Keys and author rules are the webhook's, so whichever
 * of webhook and poll arrives first wins and the other changes nothing.
 *
 * Request budget per repo: one commits listing and one events page, plus a REST lookup for each
 * pull request, issue or non-default-branch push in the window. Workers limit subrequests per invocation.
 */

import { Octokit } from "octokit";
import { enrichEvents } from "./enrich-events";
import type { GitHubEvent as RawGitHubEvent } from "./normalize-events-api";
import { normalizeEventsApiResponse } from "./normalize-events-api";
import { discoverRepos, fetchRepoCommitEvents, type DiscoveredRepo } from "./backfill";
import { getSettings } from "@/lib/settings";
import { createSupabaseStore, insertNewEvents, type ActivityStore, type NewEvent } from "@/lib/activity/store";
import { findNewCommits, recordCommitLines } from "./commit-lines";

interface PollResult {
  fetched: number;
  newEvents: number;
  repos: number;
}

const FEED_PAGE_SIZE = 100;
// The events API serves at most 300 events
const MAX_FEED_PAGES = 3;

/** Auth and rate-limit failures stop the poll; any other failure only skips its repo. */
function stopsPoll(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  return status === 401 || status === 403 || status === 429;
}

/** The repo's feed events newer than the cutoff, newest first. */
async function fetchRepoFeed(octokit: Octokit, repo: DiscoveredRepo, cutoff: Date): Promise<RawGitHubEvent[]> {
  const events: RawGitHubEvent[] = [];
  for (let page = 1; page <= MAX_FEED_PAGES; page++) {
    const { data } = await octokit.rest.activity.listRepoEvents({
      owner: repo.owner,
      repo: repo.name,
      per_page: FEED_PAGE_SIZE,
      page,
    });
    let reachedOlder = false;
    for (const event of data) {
      if (new Date(event.created_at || "") < cutoff) {
        reachedOlder = true;
        break;
      }
      events.push(event as unknown as RawGitHubEvent);
    }
    if (reachedOlder || data.length < FEED_PAGE_SIZE) break;
  }
  return events;
}

/**
 * Main polling function. Reads the included repos, normalizes and stores their events;
 * the hourly digest posts them to Discord.
 */
export async function pollGitHubEvents(
  store: ActivityStore = createSupabaseStore(),
  maxAgeHours = 12
): Promise<PollResult> {
  const settings = await getSettings();

  const token = process.env.GITHUB_EVENTS_TOKEN;
  if (!token) throw new Error("GITHUB_EVENTS_TOKEN is not set; the poll reads Staxed's repos with it");
  const octokit = new Octokit({ auth: token });

  const included = (await store.listDiscordRepos()).filter((r) => r.included);
  if (included.length === 0) return { fetched: 0, newEvents: 0, repos: 0 };

  // One listing gives every repo's visibility, which the per-repo calls do not return
  const known = new Map((await discoverRepos(octokit)).map((r) => [r.full_name.toLowerCase(), r]));
  const repos: DiscoveredRepo[] = [];
  for (const { repo_full_name } of included) {
    const repo = known.get(repo_full_name.toLowerCase());
    if (repo) repos.push(repo);
    else console.error(`Poll skipped ${repo_full_name}: not in the token's repo list`);
  }

  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  const commitEvents: NewEvent[] = [];
  const feedEvents: RawGitHubEvent[] = [];
  for (const repo of repos) {
    try {
      commitEvents.push(...(await fetchRepoCommitEvents(octokit, repo, cutoff.toISOString(), false)));
      feedEvents.push(...(await fetchRepoFeed(octokit, repo, cutoff)));
    } catch (err) {
      if (stopsPoll(err)) throw err;
      console.error(`Poll skipped ${repo.full_name}:`, err);
    }
  }

  // A push whose head commit is already stored needs no compare lookup: its commits came in through
  // the listing above or the webhook. What is left are pushes to other branches.
  const pushHeadKey = (event: RawGitHubEvent) => `commit:${event.repo.name}:${(event.payload as { head?: string }).head}`;
  const pushes = feedEvents.filter((event) => event.type === "PushEvent");
  const have = new Set<string | null>([
    ...commitEvents.map((e) => e.dedupe_key),
    ...(pushes.length > 0 ? await store.findStoredKeys(pushes.map(pushHeadKey)) : []),
  ]);
  const toEnrich = feedEvents.filter((event) => event.type !== "PushEvent" || !have.has(pushHeadKey(event)));

  const feedNormalized = await normalizeEventsApiResponse(await enrichEvents(octokit, toEnrich), settings);

  const batch = new Map<string, NewEvent>();
  for (const event of [...commitEvents, ...feedNormalized]) {
    if (event.dedupe_key && !batch.has(event.dedupe_key)) batch.set(event.dedupe_key, event);
  }
  const normalized = [...batch.values()];

  const newCommits = await findNewCommits(store, normalized);
  const stored = await insertNewEvents(store, normalized);
  await recordCommitLines(store, newCommits);

  return { fetched: commitEvents.length + feedEvents.length, newEvents: stored, repos: repos.length };
}
