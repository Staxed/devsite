/**
 * Polling-based GitHub ingestion.
 * Fetches events from the GitHub Events API and normalizes them.
 */

import { Octokit } from "octokit";
import { enrichEvents } from "./enrich-events";
import type { GitHubEvent as RawGitHubEvent } from "./normalize-events-api";
import { normalizeEventsApiResponse } from "./normalize-events-api";
import { getSettings } from "@/lib/settings";
import { createSupabaseStore, insertNewEvents, type ActivityStore } from "@/lib/activity/store";
import { findNewCommits, recordCommitLines } from "./commit-lines";

interface PollResult {
  fetched: number;
  newEvents: number;
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
 * Main polling function. Fetches events, normalizes and stores them; the hourly digest posts to Discord.
 */
export async function pollGitHubEvents(
  store: ActivityStore = createSupabaseStore(),
  maxAgeHours = 12
): Promise<PollResult> {
  const settings = await getSettings();

  const token = process.env.GITHUB_EVENTS_TOKEN;
  if (!token) throw new Error("GITHUB_EVENTS_TOKEN is not set; the poll reads Staxed's events with it");
  const octokit = new Octokit({ auth: token });

  const rawEvents = await fetchGitHubEvents(octokit, maxAgeHours);
  const normalized = await normalizeEventsApiResponse(await enrichEvents(octokit, rawEvents), settings);

  const newCommits = await findNewCommits(store, normalized);
  const stored = await insertNewEvents(store, normalized);
  await recordCommitLines(store, newCommits);

  return { fetched: rawEvents.length, newEvents: stored };
}
