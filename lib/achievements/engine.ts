import type { ActivityStore } from "@/lib/activity/store";
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
  store: ActivityStore,
  newEvents: { kind: string; occurred_at: string; title?: string | null; metadata?: Record<string, unknown> }[]
): Promise<Achievement[]> {
  const { timezone } = await getSettings();
  const today = todayInTimezone(timezone);
  const weekStart = getWeekStartFromTimezone(timezone);
  const monthStart = getMonthStartFromTimezone(timezone);
  const monthPeriod = getMonthPeriodFromTimezone(timezone);

  // A week can start before the month does, so read from whichever starts first
  const windowEvents = await store.eventsInRange(weekStart < monthStart ? weekStart : monthStart, today);
  const weekEvents = windowEvents.filter((e) => e.occurred_on >= weekStart);
  const monthEvents = windowEvents.filter((e) => e.occurred_on >= monthStart);
  const todayEvents = windowEvents.filter((e) => e.occurred_on === today);
  const totalEvents = await store.countEvents();

  // Month PR count
  const monthPRCount = monthEvents.filter((e) => e.kind === "pr_opened").length;

  // Get streaks
  const [currentStreak, weeklyStreak, monthlyStreak] = await Promise.all([
    getCodingStreak(store),
    getWeeklyStreak(store),
    getMonthlyStreak(store),
  ]);

  // Collect hours and days of week only from today's new events
  // (avoids misfiring time-based achievements from multi-day polling batches)
  const newEventHours: number[] = [];
  const newEventDays: number[] = [];
  for (const e of newEvents) {
    const d = new Date(e.occurred_at);
    const tzDate = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
    const eventDate = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, "0")}-${String(tzDate.getDate()).padStart(2, "0")}`;
    if (eventDate !== today) continue;
    newEventHours.push(tzDate.getHours());
    newEventDays.push(tzDate.getDay());
  }

  // Find longest commit message from today's commits
  let longestCommitMessage = 0;
  for (const c of todayEvents.filter((e) => e.kind === "commit_pushed")) {
    const len = (c.title || "").length;
    if (len > longestCommitMessage) longestCommitMessage = len;
  }

  const context: AchievementContext = {
    todayEvents,
    currentStreak,
    totalEvents,
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

    const inserted = await store.recordAchievement({
      achievement_id: def.id,
      name: def.name,
      emoji: def.emoji,
      description: def.description,
      period,
      earned_at: new Date().toISOString(),
      metadata: {},
    });

    if (inserted) newAchievements.push(inserted);
  }

  return newAchievements;
}
