export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendChannelMessage } from "@/lib/discord/client";
import { getSummariesToSend } from "@/lib/discord/summaries";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const providedSecret = request.headers.get("x-cron-secret");
  if (providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!channelId) {
    return NextResponse.json({ error: "DISCORD_CHANNEL_ID not configured" }, { status: 500 });
  }

  const supabase = createAdminClient();
  const summaries = await getSummariesToSend();
  const results: { type: string; sent: boolean }[] = [];

  for (const summary of summaries) {
    // Check for duplicate
    const { data: existing } = await supabase
      .from("summary_posts")
      .select("id")
      .eq("summary_type", summary.type)
      .eq("period", summary.period)
      .maybeSingle();

    if (existing) {
      results.push({ type: summary.type, sent: false });
      continue;
    }

    const message = await sendChannelMessage(channelId, {
      embeds: [summary.embed],
    });

    if (message) {
      await supabase.from("summary_posts").insert({
        summary_type: summary.type,
        period: summary.period,
        channel_id: channelId,
        message_id: message.id,
        events_count: summary.total,
        posted_at: new Date().toISOString(),
      });
      results.push({ type: summary.type, sent: true });
    } else {
      results.push({ type: summary.type, sent: false });
    }
  }

  return NextResponse.json({ ok: true, results });
}
