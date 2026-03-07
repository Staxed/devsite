export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("habits")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ habits: data });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, rule_type, target_value, target_unit, window_days, filters, visibility } = body;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("habits")
    .insert({
      name,
      rule_type: rule_type || "daily",
      target_value: target_value || 1,
      target_unit: target_unit || "count",
      window_days: window_days || 7,
      filters: filters || {},
      visibility: visibility || "public",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ habit: data }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const ALLOWED_FIELDS = ["name", "rule_type", "target_value", "target_unit", "window_days", "filters", "visibility", "is_active"] as const;
  const sanitized: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) sanitized[field] = body[field];
  }
  sanitized.updated_at = new Date().toISOString();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("habits")
    .update(sanitized)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ habit: data });
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
  const { error } = await supabase.from("habits").delete().eq("id", parsedId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
