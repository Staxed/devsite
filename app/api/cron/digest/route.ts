import { NextRequest, NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/cron/auth";
import { createSupabaseStore } from "@/lib/activity/store";
import { postHourlyDigest } from "@/lib/discord/digest";

export async function POST(request: NextRequest) {
  const denied = checkCronSecret(request);
  if (denied) return denied;

  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!channelId) {
    return NextResponse.json({ error: "DISCORD_CHANNEL_ID not configured" }, { status: 500 });
  }

  const lines = await postHourlyDigest(createSupabaseStore(), channelId, new Date());
  return NextResponse.json({ ok: true, lines });
}
