import { NextRequest, NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/cron/auth";
import { pollGitHubEvents } from "@/lib/github/poller";

export async function POST(request: NextRequest) {
  const denied = checkCronSecret(request);
  if (denied) return denied;

  try {
    const result = await pollGitHubEvents();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Poll GitHub failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
