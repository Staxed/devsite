import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";

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

  const { timezone } = await getSettings();
  const timestamp = occurred_at || new Date().toISOString();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("activity_events")
    .insert({
      occurred_at: timestamp,
      occurred_on: new Date(timestamp).toLocaleDateString("en-CA", { timeZone: timezone }),
      source: "manual",
      category,
      kind,
      value: value ?? 1,
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
  const { id } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const ALLOWED_FIELDS = ["category", "kind", "value", "unit", "title", "occurred_at", "visibility"] as const;
  const sanitized: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) sanitized[field] = body[field];
  }

  if (sanitized.occurred_at) {
    const { timezone } = await getSettings();
    sanitized.occurred_on = new Date(sanitized.occurred_at as string).toLocaleDateString("en-CA", { timeZone: timezone });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("activity_events")
    .update(sanitized)
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

  const parsedId = id ? parseInt(id, 10) : NaN;
  if (!id || isNaN(parsedId)) {
    return NextResponse.json({ error: "id is required and must be a number" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("activity_events")
    .delete()
    .eq("id", parsedId)
    .eq("source", "manual");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
