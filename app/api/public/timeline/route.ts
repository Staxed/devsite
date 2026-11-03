import { NextRequest, NextResponse } from "next/server";
import { timelineRows } from "@/lib/activity/view";
import { getSettings } from "@/lib/settings";
import type { ActivityEvent } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
  const offset = Number(searchParams.get("offset")) || 0;

  const supabase = createAdminClient();
  const { excluded_repos } = await getSettings();

  const { data, error } = await supabase
    .from("activity_events")
    .select("*")
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: timelineRows((data || []) as ActivityEvent[], excluded_repos) });
}
