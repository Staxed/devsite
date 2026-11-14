/**
 * Backfill of every event type besides commits and PRs that GitHub lets us read back for a repo.
 *
 * Each REST item is rebuilt as the webhook payload GitHub would have sent and run through
 * normalizeWebhookEvent, so its kind, dedupe_key and author rules are the webhook's own.
 * Rows are written as already posted: a backfill never sends anything to Discord.
 *
 * Not recoverable: pushes to non-default branches, collaborator changes, wiki edits, repo publicity
 * and discussions have no history endpoint. Those come from the repo events feed, which reaches back
 * about 90 days or 300 events.
 */

import type { Octokit } from "octokit";
import { getSettings } from "@/lib/settings";
import { toDateInTimezone } from "@/lib/dates";
import { createSupabaseStore, insertNewEvents, type ActivityStore, type NewEvent } from "@/lib/activity/store";
import { createEventsOctokit, type DiscoveredRepo } from "./backfill";
import { normalizeWebhookEvent } from "./normalize";
import { normalizeEventsApiResponse, type GitHubEvent } from "./normalize-events-api";

type Rec = Record<string, unknown>;

/** Event types only the repo events feed can give back; the other types have REST listings. */
const FEED_ONLY_TYPES = new Set(["CreateEvent", "DeleteEvent", "MemberEvent", "GollumEvent", "PublicEvent", "DiscussionEvent"]);
const STAR_MEDIA_TYPE = "application/vnd.github.star+json";
const MAX_STARGAZER_PAGES = 10;

export interface RepoActivityResult {
  inserted: number;
  /** Events each section found, before storing; a count of what was stored needs the whole batch. */
  found: Record<string, number>;
  /** One line per section that failed; the other sections still stored their events. */
  errors: string[];
}

const isSince = (timestamp: unknown, since: string) =>
  typeof timestamp === "string" && Date.parse(timestamp) >= Date.parse(since);

/** The number at the end of an API url such as .../issues/12 */
const numberFromUrl = (url: unknown) => Number(String(url ?? "").split("/").pop());

const lowerLogin = (value: unknown) => String((value as Rec | undefined)?.login ?? "").toLowerCase();

/** Store this repo's issues, comments, reviews, releases, forks, stars and feed-only events since `since`. */
export async function backfillRepoActivity(
  repo: DiscoveredRepo,
  since: string,
  store: ActivityStore = createSupabaseStore(),
  octokit: Octokit = createEventsOctokit()
): Promise<RepoActivityResult> {
  const settings = await getSettings();
  const user = settings.github_username.toLowerCase();
  const { owner, name } = repo;
  const repository = {
    full_name: repo.full_name,
    private: repo.visibility === "private",
    html_url: `https://github.com/${repo.full_name}`,
  };

  /** One webhook event for this repo, stamped with the time it really happened. */
  async function viaWebhook(eventName: string, payload: Rec, occurredAt: string): Promise<NewEvent[]> {
    const events = await normalizeWebhookEvent(eventName, { ...payload, repository }, settings);
    return events.map((event) => ({
      ...event,
      occurred_at: occurredAt,
      occurred_on: toDateInTimezone(occurredAt, settings.timezone),
      posted_to_discord: true,
    }));
  }

  const sections: Record<string, (warn: (message: string) => void) => Promise<NewEvent[]>> = {
    issues: async () => {
      const issues = (await octokit.paginate(octokit.rest.issues.listForRepo, {
        owner, repo: name, state: "all", since, creator: settings.github_username, per_page: 100,
      })) as unknown as Rec[];
      const events: NewEvent[] = [];
      for (const issue of issues) {
        if (issue.pull_request) continue; // the issues listing includes PRs
        if (isSince(issue.created_at, since)) events.push(...(await viaWebhook("issues", { action: "opened", issue }, issue.created_at as string)));
        if (issue.state === "closed" && isSince(issue.closed_at, since)) {
          events.push(...(await viaWebhook("issues", { action: "closed", issue }, issue.closed_at as string)));
        }
      }
      return events;
    },

    issue_comments: async () => {
      const comments = (await octokit.paginate(octokit.rest.issues.listCommentsForRepo, {
        owner, repo: name, since, per_page: 100,
      })) as unknown as Rec[];
      const events: NewEvent[] = [];
      for (const comment of comments) {
        if (!isSince(comment.created_at, since)) continue;
        const issue = { number: numberFromUrl(comment.issue_url) };
        events.push(...(await viaWebhook("issue_comment", { action: "created", comment, issue }, comment.created_at as string)));
      }
      return events;
    },

    pr_comments: async () => {
      const comments = (await octokit.paginate(octokit.rest.pulls.listReviewCommentsForRepo, {
        owner, repo: name, since, per_page: 100,
      })) as unknown as Rec[];
      const events: NewEvent[] = [];
      for (const comment of comments) {
        if (!isSince(comment.created_at, since)) continue;
        const pull_request = { number: numberFromUrl(comment.pull_request_url) };
        events.push(...(await viaWebhook("pull_request_review_comment", { action: "created", comment, pull_request }, comment.created_at as string)));
      }
      return events;
    },

    commit_comments: async () => {
      // No `since` parameter on this listing: filter by created_at
      const comments = (await octokit.paginate(octokit.rest.repos.listCommitCommentsForRepo, {
        owner, repo: name, per_page: 100,
      })) as unknown as Rec[];
      const events: NewEvent[] = [];
      for (const comment of comments) {
        if (!isSince(comment.created_at, since)) continue;
        events.push(...(await viaWebhook("commit_comment", { action: "created", comment }, comment.created_at as string)));
      }
      return events;
    },

    reviews: async () => {
      // Search finds only the PRs Staxed reviewed, so the per-PR review lookup stays small
      const q = `repo:${repo.full_name} is:pr reviewed-by:${settings.github_username} updated:>=${since.split("T")[0]}`;
      const prs = (await octokit.paginate(octokit.rest.search.issuesAndPullRequests, { q, per_page: 100 })) as unknown as Rec[];
      const events: NewEvent[] = [];
      for (const pr of prs) {
        const reviews = (await octokit.paginate(octokit.rest.pulls.listReviews, {
          owner, repo: name, pull_number: pr.number as number, per_page: 100,
        })) as unknown as Rec[];
        for (const review of reviews) {
          if (!isSince(review.submitted_at, since)) continue; // a pending review has no submitted_at
          // The webhook sends the state in lower case
          const lowered = { ...review, state: String(review.state ?? "").toLowerCase() };
          events.push(...(await viaWebhook(
            "pull_request_review",
            { action: "submitted", review: lowered, pull_request: { number: pr.number } },
            review.submitted_at as string
          )));
        }
      }
      return events;
    },

    releases: async () => {
      const releases = (await octokit.paginate(octokit.rest.repos.listReleases, { owner, repo: name, per_page: 100 })) as unknown as Rec[];
      const events: NewEvent[] = [];
      for (const release of releases) {
        if (release.draft || !isSince(release.published_at, since)) continue;
        events.push(...(await viaWebhook("release", { action: "published", release }, release.published_at as string)));
      }
      return events;
    },

    forks: async () => {
      const events: NewEvent[] = [];
      const pages = octokit.paginate.iterator(octokit.rest.repos.listForks, { owner, repo: name, sort: "newest", per_page: 100 });
      for await (const page of pages) {
        let reachedOlder = false;
        for (const fork of page.data as unknown as Rec[]) {
          if (!isSince(fork.created_at, since)) { reachedOlder = true; continue; }
          if (lowerLogin(fork.owner) !== user) continue;
          events.push(...(await viaWebhook("fork", { forkee: fork, sender: fork.owner }, fork.created_at as string)));
        }
        if (reachedOlder) break; // newest first
      }
      return events;
    },

    stars: async (warn) => {
      // Oldest star first and no way to ask for one user, so scan up to a cap
      const events: NewEvent[] = [];
      let pageCount = 0;
      const pages = octokit.paginate.iterator(octokit.rest.activity.listStargazersForRepo, {
        owner, repo: name, per_page: 100, headers: { accept: STAR_MEDIA_TYPE },
      });
      for await (const page of pages) {
        pageCount++;
        for (const star of page.data as unknown as Rec[]) {
          if (lowerLogin(star.user) !== user || !isSince(star.starred_at, since)) continue;
          events.push(...(await viaWebhook("watch", { action: "started", sender: star.user }, star.starred_at as string)));
        }
        if (pageCount >= MAX_STARGAZER_PAGES && page.data.length === 100) {
          warn(`only the first ${MAX_STARGAZER_PAGES * 100} stargazers were scanned`);
          break;
        }
      }
      return events;
    },

    feed: async () => {
      // As far back as the repo events feed reaches
      const feed = (await octokit.paginate(octokit.rest.activity.listRepoEvents, { owner, repo: name, per_page: 100 })) as unknown as GitHubEvent[];
      const wanted = feed.filter((event) => FEED_ONLY_TYPES.has(event.type) && isSince(event.created_at, since));
      const events = await normalizeEventsApiResponse(wanted, settings);
      return events.map((event) => ({ ...event, posted_to_discord: true }));
    },
  };

  const batch = new Map<string, NewEvent>();
  const found: Record<string, number> = {};
  const errors: string[] = [];
  for (const [section, run] of Object.entries(sections)) {
    try {
      const events = await run((message) => errors.push(`${section}: ${message}`));
      found[section] = events.length;
      for (const event of events) if (event.dedupe_key) batch.set(event.dedupe_key, event);
    } catch (err) {
      console.error(`Backfill ${section} for ${repo.full_name} failed:`, err);
      errors.push(`${section}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const inserted = await insertNewEvents(store, [...batch.values()]);
  return { inserted, found, errors };
}
