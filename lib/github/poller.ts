/**
 * Polling-based GitHub ingestion.
 * Fetches events from the GitHub Events API and normalizes them.
 */

import { createAuthenticatedOctokit } from "./backfill";
import { normalizeEventsApiResponse } from "./normalize-events-api";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { shouldPostEvent } from "@/lib/constants";
import { buildGroupedEmbeds, buildAchievementEmbed } from "@/lib/discord/embeds";
import { sendEmbeds } from "@/lib/discord/client";
import { checkAchievements } from "@/lib/achievements/engine";
import type { ActivityEvent } from "@/lib/supabase/types";

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
  maxAgeHours: number
): Promise<Record<string, unknown>[]> {
  const settings = await getSettings();
  const octokit = await createAuthenticatedOctokit();
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const allEvents: Record<string, unknown>[] = [];

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
      allEvents.push(event as unknown as Record<string, unknown>);
    }

    if (foundOld) break;
  }

  return allEvents;
}

/**
 * Main polling function. Fetches events, normalizes, upserts, posts to Discord.
 */
export async function pollGitHubEvents(maxAgeHours = 12): Promise<PollResult> {
  const settings = await getSettings();
  const supabase = createAdminClient();

  // 1. Fetch events from GitHub
  const rawEvents = await fetchGitHubEvents(maxAgeHours);

  // 2. Normalize
  const normalized = await normalizeEventsApiResponse(
    rawEvents as unknown as Array<{
      id: string;
      type: string;
      actor: { login: string };
      repo: { name: string };
      payload: Record<string, unknown>;
      public: boolean;
      created_at: string;
    }>,
    settings
  );

  if (normalized.length === 0) {
    // Still check for unposted events even if no new ones
    const recovered = await recoverUnpostedEvents();
    return { fetched: rawEvents.length, newEvents: 0, posted: false, recovered };
  }

  // 3. Upsert to activity_events (deduped via dedupe_key)
  const allDedupeKeys = normalized.map((e) => e.dedupe_key);
  for (let i = 0; i < normalized.length; i += 100) {
    const batch = normalized.slice(i, i + 100);
    const { error: upsertError } = await supabase
      .from("activity_events")
      .upsert(batch, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (upsertError) {
      console.error("Failed to upsert events batch:", upsertError);
    }
  }

  // 4. Find actually new (unposted) events from this batch
  const { data: newRows } = await supabase
    .from("activity_events")
    .select("*")
    .in("dedupe_key", allDedupeKeys)
    .eq("posted_to_discord", false)
    .order("occurred_at", { ascending: true });
  const newEvents = newRows || [];

  // 5. Post only new events to Discord and mark as posted
  const channelId = process.env.DISCORD_CHANNEL_ID;
  let posted = false;

  if (newEvents.length > 0) {
    // Mark all new events as posted first to prevent recovery from double-posting
    // if Discord send succeeds but a later step fails
    const ids = newEvents.map((e) => e.id);
    await supabase
      .from("activity_events")
      .update({ posted_to_discord: true })
      .in("id", ids);

    try {
      if (channelId) {
        const pollRunId = `poll:${new Date().toISOString()}`;

        // Filter events based on config
        const postable = newEvents.filter((e) => shouldPostEvent(e.kind));
        if (postable.length > 0) {
          const embeds = await buildGroupedEmbeds(postable as ActivityEvent[]);
          if (embeds.length > 0) {
            const messageIds = await sendEmbeds(channelId, embeds);

            // Record the post
            await supabase.from("discord_posts").insert({
              delivery_id: pollRunId,
              channel_id: channelId,
              message_id: messageIds[0] || null,
              events_count: postable.length,
              posted_at: new Date().toISOString(),
            });

            posted = true;
          }
        }

        // Check achievements on new events
        const newAchievements = await checkAchievements(newEvents);
        if (newAchievements.length > 0) {
          const achievementEmbeds = await Promise.all(newAchievements.map(buildAchievementEmbed));
          await sendEmbeds(channelId, achievementEmbeds);
        }
      }
    } catch (err) {
      console.error("Discord posting failed during poll:", err);
    }
  }

  // 5. Recover any unposted events
  const recovered = await recoverUnpostedEvents();

  return { fetched: rawEvents.length, newEvents: newEvents.length, posted, recovered };
}

/**
 * Find events that were stored but never posted to Discord, and post them.
 */
async function recoverUnpostedEvents(): Promise<number> {
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!channelId) return 0;

  const supabase = createAdminClient();

  // Find unposted events from the last 24 hours, but at least 5 minutes old
  // (to avoid racing with the current poll cycle's own posting)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: unposted } = await supabase
    .from("activity_events")
    .select("*")
    .eq("posted_to_discord", false)
    .gte("occurred_at", cutoff)
    .lte("occurred_at", recentCutoff)
    .order("occurred_at", { ascending: true });

  if (!unposted || unposted.length === 0) return 0;

  // Filter based on event type config
  const postable = unposted.filter((e) => shouldPostEvent(e.kind));
  if (postable.length === 0) {
    // Mark non-postable events as "posted" so they don't get re-checked
    const ids = unposted.map((e) => e.id);
    await supabase
      .from("activity_events")
      .update({ posted_to_discord: true })
      .in("id", ids);
    return 0;
  }

  try {
    const embeds = await buildGroupedEmbeds(postable as ActivityEvent[]);
    if (embeds.length > 0) {
      const recoveryId = `recovery:${new Date().toISOString()}`;
      const messageIds = await sendEmbeds(channelId, embeds);

      await supabase.from("discord_posts").insert({
        delivery_id: recoveryId,
        channel_id: channelId,
        message_id: messageIds[0] || null,
        events_count: postable.length,
        posted_at: new Date().toISOString(),
      });
    }

    // Mark all as posted
    const ids = unposted.map((e) => e.id);
    await supabase
      .from("activity_events")
      .update({ posted_to_discord: true })
      .in("id", ids);

    return postable.length;
  } catch (err) {
    console.error("Recovery posting failed:", err);
    return 0;
  }
}
