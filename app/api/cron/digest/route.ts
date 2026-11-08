import { NextRequest, NextResponse } from "next/server";
import { createSupabaseStore } from "@/lib/activity/store";
import { postHourlyDigest } from "@/lib/discord/digest";

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

  const lines = await postHourlyDigest(createSupabaseStore(), channelId, new Date());
  return NextResponse.json({ ok: true, lines });
}
