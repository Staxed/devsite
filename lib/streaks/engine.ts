import { createAdminClient } from "@/lib/supabase/server";
import { createSupabaseStore, type ActivityStore } from "@/lib/activity/store";
import { getSettings } from "@/lib/settings";
import { todayInTimezone, yesterdayInTimezone, subtractDays, getWeekStartFromDate as getWeekStart } from "@/lib/dates";
import type { ActivityEvent, Habit, Goal } from "@/lib/supabase/types";

type DatedEvent = Pick<ActivityEvent, "kind" | "occurred_on">;

/** Consecutive days with a commit_pushed event ending at `today` or the day before it; later events are ignored. */
export function codingStreakAsOf(events: DatedEvent[], today: string): number {
  const uniqueDates = [
    ...new Set(
      events
        .filter((e) => e.kind === "commit_pushed" && e.occurred_on <= today && e.occurred_on >= subtractDays(today, 365))
        .map((e) => e.occurred_on)
    ),
  ].sort((a, b) => b.localeCompare(a));

  if (uniqueDates.length === 0) return 0;
  if (uniqueDates[0] !== today && uniqueDates[0] !== subtractDays(today, 1)) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    if (uniqueDates[i] !== subtractDays(uniqueDates[i - 1], 1)) break;
    streak++;
  }
  return streak;
}

/**
 * Count consecutive days with at least 1 commit_pushed event,
 * ending today or yesterday (in configured timezone).
 */
export async function getCodingStreak(store: ActivityStore = createSupabaseStore()): Promise<number> {
  const { timezone } = await getSettings();
  const today = todayInTimezone(timezone);
  return codingStreakAsOf(await store.eventsInRange(subtractDays(today, 365), today), today);
}

/**
 * Evaluate a habit for a specific date.
 * Returns { met: boolean, current: number, target: number }
 */
export async function evaluateHabitForDate(
  habit: Habit,
  date: string
): Promise<{ met: boolean; current: number; target: number }> {
  const supabase = createAdminClient();
  const filters = habit.filters;

  let startDate: string;
  let endDate: string;

  switch (habit.rule_type) {
    case "daily":
      startDate = date;
      endDate = date;
      break;
    case "weekly":
      startDate = getWeekStart(date);
      endDate = subtractDays(startDate, -6); // 7 days from Monday
      break;
    case "rolling":
      startDate = subtractDays(date, (habit.window_days || 7) - 1);
      endDate = date;
      break;
  }

  let query = supabase
    .from("activity_events")
    .select("value")
    .gte("occurred_on", startDate)
    .lte("occurred_on", endDate);

  if (filters.source) query = query.eq("source", filters.source);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.kind) query = query.eq("kind", filters.kind);

  const { data, error } = await query;

  if (error || !data) return { met: false, current: 0, target: habit.target_value };

  const current = data.reduce((sum, e) => sum + (Number(e.value) || 0), 0);

  return {
    met: current >= habit.target_value,
    current,
    target: habit.target_value,
  };
}

/**
 * Count consecutive periods where a habit was met.
 */
export async function getHabitStreak(habit: Habit): Promise<number> {
  const { timezone } = await getSettings();
  const today = todayInTimezone(timezone);
  let streak = 0;
  let currentDate = today;

  // Check up to 365 periods back
  for (let i = 0; i < 365; i++) {
    const result = await evaluateHabitForDate(habit, currentDate);
    if (!result.met) break;
    streak++;

    switch (habit.rule_type) {
      case "daily":
        currentDate = subtractDays(currentDate, 1);
        break;
      case "weekly":
        currentDate = subtractDays(currentDate, 7);
        break;
      case "rolling":
        currentDate = subtractDays(currentDate, habit.window_days || 7);
        break;
    }
  }

  return streak;
}

/**
 * Get goal progress: sum of matching events in [start_date, end_date] vs target.
 */
export async function getGoalProgress(
  goal: Goal
): Promise<{ current: number; target: number; percentage: number }> {
  const supabase = createAdminClient();
  const filters = goal.filters;

  let query = supabase
    .from("activity_events")
    .select("value")
    .gte("occurred_on", goal.start_date)
    .lte("occurred_on", goal.end_date);

  if (filters.source) query = query.eq("source", filters.source);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.kind) query = query.eq("kind", filters.kind);

  const { data, error } = await query;

  if (error || !data) return { current: 0, target: goal.target_value, percentage: 0 };

  const current = data.reduce((sum, e) => sum + (Number(e.value) || 0), 0);
  const percentage = Math.min(100, Math.round((current / goal.target_value) * 100));

  return { current, target: goal.target_value, percentage };
}

/**
 * Get period stats (count of events by kind for a given date range).
 */
export async function getPeriodStats(
  startDate: string,
  endDate: string,
  store: ActivityStore = createSupabaseStore()
): Promise<Record<string, number>> {
  const data = await store.eventsInRange(startDate, endDate);

  const stats: Record<string, number> = {};
  for (const event of data) {
    stats[event.kind] = (stats[event.kind] || 0) + (Number(event.value) || 0);
  }
  return stats;
}

/**
 * Get the longest coding streak all-time (consecutive days with commits).
 */
export async function getLongestStreak(): Promise<number> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("activity_events")
    .select("occurred_on")
    .eq("kind", "commit_pushed")
    .order("occurred_on", { ascending: true });

  if (error || !data) return 0;

  const uniqueDates = [...new Set(data.map((e) => e.occurred_on))].sort();
  if (uniqueDates.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let i = 1; i < uniqueDates.length; i++) {
    const prevPlusOne = subtractDays(uniqueDates[i - 1], -1);
    if (prevPlusOne === uniqueDates[i]) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

function previousMonth(month: string): string {
  const prev = new Date(month + "-15");
  prev.setMonth(prev.getMonth() - 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

/** Consecutive ISO weeks (Mon-Sun) with an event, ending at the week of `today` or the one before; later events are ignored. */
export function weeklyStreakAsOf(events: Pick<ActivityEvent, "occurred_on">[], today: string): number {
  const weeks = new Set<string>();
  for (const e of events) {
    if (e.occurred_on <= today) weeks.add(getWeekStart(e.occurred_on));
  }
  const sortedWeeks = [...weeks].sort((a, b) => b.localeCompare(a));
  if (sortedWeeks.length === 0) return 0;

  const currentWeekStart = getWeekStart(today);
  if (sortedWeeks[0] !== currentWeekStart && sortedWeeks[0] !== subtractDays(currentWeekStart, 7)) return 0;

  let streak = 1;
  for (let i = 1; i < sortedWeeks.length; i++) {
    if (sortedWeeks[i] !== subtractDays(sortedWeeks[i - 1], 7)) break;
    streak++;
  }
  return streak;
}

/** Consecutive months with an event, ending at the month of `today` or the one before; later events are ignored. */
export function monthlyStreakAsOf(events: Pick<ActivityEvent, "occurred_on">[], today: string): number {
  const months = new Set<string>();
  for (const e of events) {
    if (e.occurred_on <= today) months.add(e.occurred_on.slice(0, 7));
  }
  const sortedMonths = [...months].sort((a, b) => b.localeCompare(a));
  if (sortedMonths.length === 0) return 0;

  const currentMonth = today.slice(0, 7);
  if (sortedMonths[0] !== currentMonth && sortedMonths[0] !== previousMonth(currentMonth)) return 0;

  let streak = 1;
  for (let i = 1; i < sortedMonths.length; i++) {
    if (sortedMonths[i] !== previousMonth(sortedMonths[i - 1])) break;
    streak++;
  }
  return streak;
}

/**
 * Count consecutive weeks (ISO weeks, Mon-Sun) with at least 1 event,
 * ending at the current or previous week.
 */
export async function getWeeklyStreak(store: ActivityStore = createSupabaseStore()): Promise<number> {
  const { timezone } = await getSettings();
  const today = todayInTimezone(timezone);
  return weeklyStreakAsOf(await store.eventsInRange(subtractDays(today, 1095), today), today);
}

/**
 * Count consecutive months with at least 1 event,
 * ending at the current or previous month.
 */
export async function getMonthlyStreak(store: ActivityStore = createSupabaseStore()): Promise<number> {
  const { timezone } = await getSettings();
  const today = todayInTimezone(timezone);
  return monthlyStreakAsOf(await store.eventsInRange(subtractDays(today, 1825), today), today);
}

/**
 * Count consecutive years with at least 1 event,
 * ending at the current or previous year.
 */
export async function getYearlyStreak(): Promise<number> {
  const { timezone } = await getSettings();
  const supabase = createAdminClient();
  const today = todayInTimezone(timezone);

  const { data, error } = await supabase
    .from("activity_events")
    .select("occurred_on")
    .lte("occurred_on", today);

  if (error || !data || data.length === 0) return 0;

  const years = new Set<string>();
  for (const e of data) {
    years.add(e.occurred_on.slice(0, 4));
  }

  const sortedYears = [...years].sort((a, b) => b.localeCompare(a));
  if (sortedYears.length === 0) return 0;

  const currentYear = today.slice(0, 4);
  const previousYear = String(Number(currentYear) - 1);

  if (sortedYears[0] !== currentYear && sortedYears[0] !== previousYear) return 0;

  let streak = 1;
  for (let i = 1; i < sortedYears.length; i++) {
    const expected = String(Number(sortedYears[i - 1]) - 1);
    if (sortedYears[i] === expected) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Convenience wrapper to get all streak types at once.
 */
export async function getAllStreaks(): Promise<{
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
}> {
  const [daily, weekly, monthly, yearly] = await Promise.all([
    getCodingStreak(),
    getWeeklyStreak(),
    getMonthlyStreak(),
    getYearlyStreak(),
  ]);
  return { daily, weekly, monthly, yearly };
}

/**
 * GitHub events in a date range, for the repos breakdown.
 */
export async function getGithubEventsInRange(
  startDate: string,
  endDate: string
): Promise<ActivityEvent[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("activity_events")
    .select("*")
    .eq("source", "github")
    .gte("occurred_on", startDate)
    .lte("occurred_on", endDate);

  if (error) throw new Error(`Failed to load activity events: ${error.message}`);
  return (data ?? []) as ActivityEvent[];
}

/**
 * Get hour-of-day and day-of-week activity distributions.
 */
export async function getTimePatterns(
  startDate: string,
  endDate: string
): Promise<{ hourly: Record<number, number>; daily: Record<number, number> }> {
  const { timezone } = await getSettings();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("activity_events")
    .select("occurred_at")
    .gte("occurred_on", startDate)
    .lte("occurred_on", endDate);

  if (error || !data) return { hourly: {}, daily: {} };

  const hourly: Record<number, number> = {};
  const daily: Record<number, number> = {};

  for (const event of data) {
    const d = new Date(event.occurred_at);
    const tzDate = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
    const hour = tzDate.getHours();
    const day = tzDate.getDay();
    hourly[hour] = (hourly[hour] || 0) + 1;
    daily[day] = (daily[day] || 0) + 1;
  }

  return { hourly, daily };
}
