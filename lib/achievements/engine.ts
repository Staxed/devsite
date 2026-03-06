import { createAdminClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getCodingStreak, getWeeklyStreak, getMonthlyStreak } from "@/lib/streaks/engine";
import {
  ACHIEVEMENT_DEFINITIONS,
  type AchievementContext,
} from "./definitions";
import type { Achievement } from "@/lib/supabase/types";

import { todayInTimezone, getWeekStartFromTimezone, getMonthStartFromTimezone, getMonthPeriodFromTimezone } from "@/lib/dates";

/**
 * Check all achievement definitions against current state.
 * Returns newly earned achievements (already inserted into DB).
 */
export async function checkAchievements(
  newEvents: { kind: string; occurred_at: string; title?: string | null; metadata?: Record<string, unknown> }[]
): Promise<Achievement[]> {
  const { timezone } = await getSettings();
  const supabase = createAdminClient();
  const today = todayInTimezone(timezone);
  const weekStart = getWeekStartFromTimezone(timezone);
  const monthStart = getMonthStartFromTimezone(timezone);
  const monthPeriod = getMonthPeriodFromTimezone(timezone);

  // Get today's events
  const { data: todayData } = await supabase
    .from("activity_events")
    .select("kind, occurred_at")
    .eq("occurred_on", today);
  const todayEvents = todayData || [];

  // Get this week's events
  const { data: weekData } = await supabase
    .from("activity_events")
    .select("kind, occurred_on")
    .gte("occurred_on", weekStart)
    .lte("occurred_on", today);
  const weekEvents = weekData || [];

  // Get this month's events
  const { data: monthData } = await supabase
    .from("activity_events")
    .select("kind, occurred_on")
    .gte("occurred_on", monthStart)
    .lte("occurred_on", today);
  const monthEvents = monthData || [];

  // Get total event count
  const { count: totalEvents } = await supabase
    .from("activity_events")
    .select("*", { count: "exact", head: true });

  // Month PR count
  const monthPRCount = monthEvents.filter((e) => e.kind === "pr_opened").length;

  // Get streaks
  const [currentStreak, weeklyStreak, monthlyStreak] = await Promise.all([
    getCodingStreak(),
    getWeeklyStreak(),
    getMonthlyStreak(),
  ]);

  // Collect hours and days of week for all new events (for time-based achievements)
  const newEventHours: number[] = [];
  const newEventDays: number[] = [];
  for (const e of newEvents) {
    const d = new Date(e.occurred_at);
    const tzDate = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
    newEventHours.push(tzDate.getHours());
    newEventDays.push(tzDate.getDay());
  }

  // Find longest commit message from today's commits (query DB for resilience)
  let longestCommitMessage = 0;
  const { data: todayCommits } = await supabase
    .from("activity_events")
    .select("title")
    .eq("occurred_on", today)
    .eq("kind", "commit_pushed");
  for (const c of todayCommits || []) {
    const len = (c.title || "").length;
    if (len > longestCommitMessage) longestCommitMessage = len;
  }

  const context: AchievementContext = {
    todayEvents,
    currentStreak,
    totalEvents: totalEvents || 0,
    newEventHours,
    newEventDays,
    weekEvents,
    monthEvents,
    monthPRCount,
    longestCommitMessage,
    weeklyStreak,
    monthlyStreak,
  };

  const newAchievements: Achievement[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (!def.evaluate(context)) continue;

    // Determine period for dedup
    let period: string;
    if (def.type === "milestone") {
      period = "all-time";
    } else if (def.period === "weekly") {
      period = weekStart; // dedup on week start date
    } else if (def.period === "monthly") {
      period = monthPeriod; // dedup on YYYY-MM
    } else {
      period = today; // daily (default)
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
