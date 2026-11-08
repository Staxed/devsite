import { type NextRequest, NextResponse } from "next/server";
import { verifyGitHubWebhook } from "@/lib/github/verify";
import { normalizeWebhookEvent } from "@/lib/github/normalize";
import { createAdminClient } from "@/lib/supabase/server";
import { claimAndPostEvents } from "@/lib/discord/notify";
import { findNewCommits, recordCommitLines } from "@/lib/github/commit-lines";
import { getSettings } from "@/lib/settings";
import type { ActivityStore } from "@/lib/activity/store";

export async function handleGitHubWebhook(request: NextRequest, store: ActivityStore) {
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

    const newCommits = await findNewCommits(store, events);
    await store.upsertEvents(events);
    await recordCommitLines(store, newCommits);

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
        await claimAndPostEvents(store, discordChannelId, events.map((e) => e.dedupe_key), deliveryId);
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
