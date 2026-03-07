export const runtime = "edge";

import { NextResponse } from "next/server";
import { getCodingStreak } from "@/lib/streaks/engine";
import { createAdminClient } from "@/lib/supabase/server";
import type { Habit } from "@/lib/supabase/types";

export async function GET() {
  const supabase = createAdminClient();

  const [codingStreak, { data: habits }] = await Promise.all([
    getCodingStreak(),
    supabase
      .from("habits")
      .select("*")
      .eq("is_active", true)
      .eq("visibility", "public"),
  ]);

  // For public habits, we just report the name + active status
  const publicHabits = (habits as Habit[] | null)?.map((h) => ({
    name: h.name,
    rule_type: h.rule_type,
    target_value: h.target_value,
    target_unit: h.target_unit,
  })) || [];

  return NextResponse.json({
    coding_streak: codingStreak,
    habits: publicHabits,
  });
}
