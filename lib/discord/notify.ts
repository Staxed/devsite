import type { ActivityStore } from "@/lib/activity/store";
import { sendEmbeds } from "./client";
import { buildGroupedEmbeds, buildAchievementEmbed } from "./embeds";
import { checkAchievements } from "@/lib/achievements/engine";
import { shouldPostEvent } from "@/lib/constants";

/**
 * Claim the given events (dedupe keys) and post only the ones this call claimed,
 * then post any achievements this call recorded.
 *
 * The claim happens before the send and a failed send is not retried, so racing
 * paths (webhook, poll, recovery) post each event once. Returns how many events were posted.
 */
export async function claimAndPostEvents(
  store: ActivityStore,
  channelId: string,
  dedupeKeys: string[],
  deliveryId: string
): Promise<number> {
  const claimed = await store.claimEvents(dedupeKeys);
  if (claimed.length === 0) return 0;

  const postable = claimed.filter((e) => shouldPostEvent(e.kind));
  let posted = 0;
  if (postable.length > 0) {
    const embeds = await buildGroupedEmbeds(postable);
    if (embeds.length > 0) {
      const messageIds = await sendEmbeds(channelId, embeds);
      await store.recordDiscordPost({
        delivery_id: deliveryId,
        channel_id: channelId,
        message_id: messageIds[0] || null,
        events_count: postable.length,
      });
      posted = postable.length;
    }
  }

  const newAchievements = await checkAchievements(store, claimed);
  if (newAchievements.length > 0) {
    await sendEmbeds(channelId, await Promise.all(newAchievements.map(buildAchievementEmbed)));
  }

  return posted;
}
