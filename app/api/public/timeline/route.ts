import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
  const offset = Number(searchParams.get("offset")) || 0;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("activity_events")
    .select("*")
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Scrub private event details for public consumption
  const publicData = (data || []).map((event) => {
    if (event.visibility === "private") {
      return {
        ...event,
        url: null,
        metadata: {},
        title: event.public_summary || "Activity in a private repository",
      };
    }
    return event;
  });

  return NextResponse.json({ events: publicData });
}
