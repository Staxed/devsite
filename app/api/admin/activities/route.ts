import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { TIMEZONE } from "@/lib/constants";

function toDateInTimezone(isoDate: string, tz: string): string {
  return new Date(isoDate).toLocaleDateString("en-CA", { timeZone: tz });
}

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("activity_events")
    .select("*")
    .eq("source", "manual")
    .order("occurred_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activities: data });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { category, kind, value, unit, title, occurred_at, visibility } = body;

  if (!category || !kind) {
    return NextResponse.json({ error: "category and kind are required" }, { status: 400 });
  }

  const timestamp = occurred_at || new Date().toISOString();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("activity_events")
    .insert({
      occurred_at: timestamp,
      occurred_on: toDateInTimezone(timestamp, TIMEZONE),
      source: "manual",
      category,
      kind,
      value: value || 1,
      unit: unit || "count",
      title: title || null,
      public_summary: title || null,
      visibility: visibility || "public",
      repo_visibility: null,
      repo_hash: null,
      url: null,
      metadata: {},
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activity: data }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  if (updates.occurred_at) {
    updates.occurred_on = toDateInTimezone(updates.occurred_at, TIMEZONE);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("activity_events")
    .update(updates)
    .eq("id", id)
    .eq("source", "manual")
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activity: data });
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("activity_events")
    .delete()
    .eq("id", Number(id))
    .eq("source", "manual");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
