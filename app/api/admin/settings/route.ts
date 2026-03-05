import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { invalidateSettingsCache } from "@/lib/settings";

const ALLOWED_KEYS = ["github_username", "github_org", "timezone"];

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value, updated_at")
    .order("key");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function PUT(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { key, value } = body;

  if (!key || typeof key !== "string" || !ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: `Invalid key. Allowed: ${ALLOWED_KEYS.join(", ")}` }, { status: 400 });
  }

  if (value === undefined || typeof value !== "string") {
    return NextResponse.json({ error: "value must be a string" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateSettingsCache();

  return NextResponse.json({ setting: data });
}
