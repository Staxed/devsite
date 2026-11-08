import { NextRequest, NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/cron/auth";
import { createSupabaseStore } from "@/lib/activity/store";
import { postSummaries } from "@/lib/discord/summaries";

export async function POST(request: NextRequest) {
  const denied = checkCronSecret(request);
  if (denied) return denied;

  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!channelId) {
    return NextResponse.json({ error: "DISCORD_CHANNEL_ID not configured" }, { status: 500 });
  }

  const results = await postSummaries(createSupabaseStore(), channelId);
  return NextResponse.json({ ok: true, results });
}
