import { createAdminClient } from "@/lib/supabase/server";
import { sendEmbeds } from "./client";
import { buildGroupedEmbeds } from "./embeds";
import { shouldPostEvent } from "@/lib/constants";
import type { ActivityEvent } from "@/lib/supabase/types";

/**
 * Post normalized events to a Discord channel.
 * Checks discord_posts table to prevent duplicate posts for the same delivery.
 * Discord posting is best-effort — errors are logged but don't fail the caller.
 */
export async function postEventsToDiscord(
  channelId: string,
  events: ActivityEvent[],
  deliveryId: string
): Promise<void> {
  if (events.length === 0) return;

  const supabase = createAdminClient();

  // Check for duplicate delivery
  const { data: existing } = await supabase
    .from("discord_posts")
    .select("id")
    .eq("delivery_id", deliveryId)
    .maybeSingle();

  if (existing) {
    console.log(`Discord post already sent for delivery ${deliveryId}`);
    return;
  }

  // Filter events based on event type config
  const filteredEvents = events.filter((e) => shouldPostEvent(e.kind));
  if (filteredEvents.length === 0) return;

  // Build embeds and send
  const embeds = buildGroupedEmbeds(filteredEvents as ActivityEvent[]);
  if (embeds.length === 0) return;

  const messageIds = await sendEmbeds(channelId, embeds);

  // Record the post to prevent duplicates
  await supabase.from("discord_posts").insert({
    delivery_id: deliveryId,
    channel_id: channelId,
    message_id: messageIds[0] || null,
    events_count: filteredEvents.length,
    posted_at: new Date().toISOString(),
  });
}
