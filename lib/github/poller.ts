/**
 * Polling-based GitHub ingestion.
 * Fetches events from the GitHub Events API and normalizes them.
 */

import { Octokit } from "octokit";
import { enrichEvents } from "./enrich-events";
import type { GitHubEvent as RawGitHubEvent } from "./normalize-events-api";
import { normalizeEventsApiResponse } from "./normalize-events-api";
import { getSettings } from "@/lib/settings";
import { createSupabaseStore, type ActivityStore } from "@/lib/activity/store";
import { claimAndPostEvents } from "@/lib/discord/notify";

interface PollResult {
  fetched: number;
  newEvents: number;
  posted: boolean;
  recovered: number;
}

/**
 * Fetch recent events from the GitHub Events API for the configured user.
 * Filters to events within the given time window.
 */
async function fetchGitHubEvents(
  octokit: Octokit,
  maxAgeHours: number
): Promise<RawGitHubEvent[]> {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const allEvents: RawGitHubEvent[] = [];

  // Fetch up to 10 pages (300 events max from Events API)
  for (let page = 1; page <= 10; page++) {
    const { data } = await octokit.rest.activity.listEventsForAuthenticatedUser({
      username: settings.github_username,
      per_page: 30,
      page,
    });

    if (!data || data.length === 0) break;

    let foundOld = false;
    for (const event of data) {
      const createdAt = new Date(event.created_at || "");
      if (createdAt < cutoff) {
        foundOld = true;
        break;
      }
      allEvents.push(event as unknown as RawGitHubEvent);
    }

    if (foundOld) break;
  }

  return allEvents;
}

/**
 * Main polling function. Fetches events, normalizes, upserts, posts to Discord.
 */
export async function pollGitHubEvents(
  store: ActivityStore = createSupabaseStore(),
  maxAgeHours = 12
): Promise<PollResult> {
  const settings = await getSettings();
  const channelId = process.env.DISCORD_CHANNEL_ID;

  const token = process.env.GITHUB_EVENTS_TOKEN;
  if (!token) throw new Error("GITHUB_EVENTS_TOKEN is not set; the poll reads Staxed's events with it");
  const octokit = new Octokit({ auth: token });

  const rawEvents = await fetchGitHubEvents(octokit, maxAgeHours);
  const normalized = await normalizeEventsApiResponse(await enrichEvents(octokit, rawEvents), settings);

  const before = await store.countEvents();
  await store.upsertEvents(normalized);
  const stored = (await store.countEvents()) - before;

  let posted = false;
  if (channelId && normalized.length > 0) {
    try {
      const pollRunId = `poll:${new Date().toISOString()}`;
      posted = (await claimAndPostEvents(store, channelId, normalized.map((e) => e.dedupe_key), pollRunId)) > 0;
    } catch (err) {
      console.error("Discord posting failed during poll:", err);
    }
  }

  const recovered = channelId ? await recoverUnpostedEvents(store, channelId) : 0;

  return { fetched: rawEvents.length, newEvents: stored, posted, recovered };
}

/**
 * Post events that were stored but never claimed (for example when the process died
 * between storing and posting). Claiming first means events the webhook or this poll
 * already claimed are never posted again.
 */
async function recoverUnpostedEvents(store: ActivityStore, channelId: string): Promise<number> {
  // At least 5 minutes old, to avoid racing with a path that is about to claim them
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const unposted = await store.findUnpostedEvents(cutoff, recentCutoff);
  const dedupeKeys = unposted.flatMap((e) => (e.dedupe_key ? [e.dedupe_key] : []));
  if (dedupeKeys.length === 0) return 0;

  try {
    return await claimAndPostEvents(store, channelId, dedupeKeys, `recovery:${new Date().toISOString()}`);
  } catch (err) {
    console.error("Recovery posting failed:", err);
    return 0;
  }
}
