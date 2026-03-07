export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { verifyGitHubWebhook } from "@/lib/github/verify";
import { normalizeWebhookEvent } from "@/lib/github/normalize";
import { createAdminClient } from "@/lib/supabase/server";
import { postEventsToDiscord } from "@/lib/discord/notify";
import { getSettings } from "@/lib/settings";
import { checkAchievements } from "@/lib/achievements/engine";
import { sendEmbeds } from "@/lib/discord/client";
import { buildAchievementEmbed } from "@/lib/discord/embeds";
import type { ActivityEvent } from "@/lib/supabase/types";

export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const eventName = request.headers.get("x-github-event");
  const deliveryId = request.headers.get("x-github-delivery");

  if (!(await verifyGitHubWebhook(body, signature, secret))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!eventName || !deliveryId) {
    return NextResponse.json({ error: "Missing event headers" }, { status: 400 });
  }

  const supabase = createAdminClient();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    // Store delivery with error status if possible
    await supabase
      .from("github_deliveries")
      .upsert(
        {
          delivery_id: deliveryId,
          event_name: eventName,
          payload: {},
          status: "error",
          error: "Invalid JSON",
          received_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        },
        { onConflict: "delivery_id" }
      );
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Store raw delivery
  const { error: deliveryError } = await supabase
    .from("github_deliveries")
    .upsert(
      {
        delivery_id: deliveryId,
        event_name: eventName,
        payload,
        status: "pending",
        received_at: new Date().toISOString(),
      },
      { onConflict: "delivery_id" }
    );

  if (deliveryError) {
    return NextResponse.json({ error: "Failed to store delivery" }, { status: 500 });
  }

  // Normalize to activity events
  try {
    const settings = await getSettings();
    const events = await normalizeWebhookEvent(eventName, payload, settings);

    if (events.length > 0) {
      const { error: insertError } = await supabase
        .from("activity_events")
        .upsert(events, { onConflict: "dedupe_key", ignoreDuplicates: true });

      if (insertError) {
        await supabase
          .from("github_deliveries")
          .update({ status: "error", error: insertError.message, processed_at: new Date().toISOString() })
          .eq("delivery_id", deliveryId);

        return NextResponse.json({ error: "Failed to store events" }, { status: 500 });
      }
    }

    await supabase
      .from("github_deliveries")
      .update({
        status: events.length > 0 ? "processed" : "skipped",
        processed_at: new Date().toISOString(),
      })
      .eq("delivery_id", deliveryId);

    // Proactive Discord posting (best-effort)
    const discordChannelId = process.env.DISCORD_CHANNEL_ID;
    if (discordChannelId && events.length > 0) {
      try {
        await postEventsToDiscord(discordChannelId, events as ActivityEvent[], deliveryId);

        // Check achievements and post any new ones
        const newAchievements = await checkAchievements(events);
        if (newAchievements.length > 0) {
          const achievementEmbeds = await Promise.all(newAchievements.map(buildAchievementEmbed));
          await sendEmbeds(discordChannelId, achievementEmbeds);
        }
      } catch (discordErr) {
        console.error("Discord posting failed:", discordErr);
        // Don't fail the webhook response
      }
    }

    return NextResponse.json({ ok: true, events_created: events.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("github_deliveries")
      .update({ status: "error", error: message, processed_at: new Date().toISOString() })
      .eq("delivery_id", deliveryId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
