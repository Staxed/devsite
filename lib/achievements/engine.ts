import { createAdminClient } from "@/lib/supabase/server";
import { TIMEZONE } from "@/lib/constants";
import { getCodingStreak } from "@/lib/streaks/engine";
import {
  ACHIEVEMENT_DEFINITIONS,
  type AchievementContext,
} from "./definitions";
import type { Achievement } from "@/lib/supabase/types";

function todayInTimezone(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

function getMonthPeriod(tz: string): string {
  const d = new Date();
  const year = Number(d.toLocaleDateString("en-CA", { timeZone: tz, year: "numeric" }));
  const month = d.toLocaleDateString("en-CA", { timeZone: tz, month: "2-digit" });
  return `${year}-${month}`;
}

/**
 * Check all achievement definitions against current state.
 * Returns newly earned achievements (already inserted into DB).
 */
export async function checkAchievements(
  newEvents: { kind: string; occurred_at: string }[]
): Promise<Achievement[]> {
  const supabase = createAdminClient();
  const today = todayInTimezone(TIMEZONE);

  // Get today's events count
  const { data: todayData } = await supabase
    .from("activity_events")
    .select("kind, occurred_at")
    .eq("occurred_on", today);

  const todayEvents = todayData || [];

  // Get total event count
  const { count: totalEvents } = await supabase
    .from("activity_events")
    .select("*", { count: "exact", head: true });

  // Get current streak
  const currentStreak = await getCodingStreak();

  // Determine latest event time details
  let latestEventHour: number | null = null;
  let latestEventDay: number | null = null;
  if (newEvents.length > 0) {
    const latest = new Date(newEvents[newEvents.length - 1].occurred_at);
    const tzDate = new Date(latest.toLocaleString("en-US", { timeZone: TIMEZONE }));
    latestEventHour = tzDate.getHours();
    latestEventDay = tzDate.getDay();
  }

  const context: AchievementContext = {
    todayEvents,
    currentStreak,
    totalEvents: totalEvents || 0,
    latestEventHour,
    latestEventDay,
  };

  const newAchievements: Achievement[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    // Special case: century_month is evaluated via monthly count
    if (def.id === "century_month") {
      const monthPeriod = getMonthPeriod(TIMEZONE);
      const monthStart = `${monthPeriod}-01`;
      // Get last day of month
      const [y, m] = monthPeriod.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const monthEnd = `${monthPeriod}-${String(lastDay).padStart(2, "0")}`;

      const { count: monthCount } = await supabase
        .from("activity_events")
        .select("*", { count: "exact", head: true })
        .gte("occurred_on", monthStart)
        .lte("occurred_on", monthEnd);

      if (!monthCount || monthCount < 100) continue;

      // Check if already earned for this month
      const { data: existing } = await supabase
        .from("achievements")
        .select("id")
        .eq("achievement_id", def.id)
        .eq("period", monthPeriod)
        .maybeSingle();

      if (existing) continue;

      const { data: inserted } = await supabase
        .from("achievements")
        .insert({
          achievement_id: def.id,
          name: def.name,
          emoji: def.emoji,
          description: def.description,
          period: monthPeriod,
          earned_at: new Date().toISOString(),
          metadata: { month_count: monthCount },
        })
        .select()
        .single();

      if (inserted) newAchievements.push(inserted as Achievement);
      continue;
    }

    if (!def.evaluate(context)) continue;

    // Determine period for dedup
    let period: string;
    if (def.type === "milestone") {
      period = "all-time";
    } else {
      period = today; // repeatable = daily
    }

    // Check if already earned
    const { data: existing } = await supabase
      .from("achievements")
      .select("id")
      .eq("achievement_id", def.id)
      .eq("period", period)
      .maybeSingle();

    if (existing) continue;

    const { data: inserted } = await supabase
      .from("achievements")
      .insert({
        achievement_id: def.id,
        name: def.name,
        emoji: def.emoji,
        description: def.description,
        period,
        earned_at: new Date().toISOString(),
        metadata: {},
      })
      .select()
      .single();

    if (inserted) newAchievements.push(inserted as Achievement);
  }

  return newAchievements;
}
