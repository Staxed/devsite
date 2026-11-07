import type { NextRequest } from "next/server";
import { handleGitHubWebhook } from "@/lib/github/webhook";
import { createSupabaseStore } from "@/lib/activity/store";

export async function POST(request: NextRequest) {
  return handleGitHubWebhook(request, createSupabaseStore());
}
