import type { ActivityStore } from "@/lib/activity/store";
import { getSettings } from "@/lib/settings";
import {
  getCodingStreak,
  getWeeklyStreak,
  getMonthlyStreak,
  codingStreakAsOf,
  weeklyStreakAsOf,
  monthlyStreakAsOf,
} from "@/lib/streaks/engine";
import { ACHIEVEMENT_DEFINITIONS, type AchievementContext } from "./definitions";
import type { Achievement, ActivityEvent } from "@/lib/supabase/types";
import {
  todayInTimezone,
  getWeekStartFromTimezone,
  getMonthStartFromTimezone,
  getMonthPeriodFromTimezone,
  getWeekStartFromDate,
  subtractDays,
  toDateInTimezone,
} from "@/lib/dates";

/** The dates an achievement is evaluated "as of": the day, the week it falls in and its month. */
interface EvaluationPeriods {
  today: string;
  weekStart: string;
  monthPeriod: string;
}

interface EarnedAchievement {
  definition: (typeof ACHIEVEMENT_DEFINITIONS)[number];
  period: string;
}

/** Pure: which achievements the context earns, each with the period it dedupes on. */
export function evaluateAchievements(context: AchievementContext, periods: EvaluationPeriods): EarnedAchievement[] {
  const earned: EarnedAchievement[] = [];
  for (const definition of ACHIEVEMENT_DEFINITIONS) {
    if (!definition.evaluate(context)) continue;
    let period: string;
    if (definition.type === "milestone") period = "all-time";
    else if (definition.period === "weekly") period = periods.weekStart;
    else if (definition.period === "monthly") period = periods.monthPeriod;
    else period = periods.today;
    earned.push({ definition, period });
  }
  return earned;
}

function localHourAndDay(occurredAt: string, timezone: string): { hour: number; day: number } {
  const tzDate = new Date(new Date(occurredAt).toLocaleString("en-US", { timeZone: timezone }));
  return { hour: tzDate.getHours(), day: tzDate.getDay() };
}

/** The fields of the context that come from the day's events alone. */
function dayFields(
  todayEvents: ActivityEvent[],
  newEvents: { occurred_at: string }[],
  timezone: string
): Pick<AchievementContext, "newEventHours" | "newEventDays" | "longestCommitMessage"> {
  const localTimes = newEvents.map((e) => localHourAndDay(e.occurred_at, timezone));
  const longestCommitMessage = todayEvents
    .filter((e) => e.kind === "commit_pushed")
    .reduce((longest, c) => Math.max(longest, (c.title || "").length), 0);
  return {
    newEventHours: localTimes.map((t) => t.hour),
    newEventDays: localTimes.map((t) => t.day),
    longestCommitMessage,
  };
}

/** Live context builder: reads the current day, week, month and streaks from the store. */
async function buildLiveContext(
  store: ActivityStore,
  newEvents: { occurred_at: string }[],
  timezone: string
): Promise<{ context: AchievementContext; periods: EvaluationPeriods }> {
  const today = todayInTimezone(timezone);
  const weekStart = getWeekStartFromTimezone(timezone);
  const monthStart = getMonthStartFromTimezone(timezone);

  // A week can start before the month does, so read from whichever starts first
  const windowEvents = await store.eventsInRange(weekStart < monthStart ? weekStart : monthStart, today);
  const weekEvents = windowEvents.filter((e) => e.occurred_on >= weekStart);
  const monthEvents = windowEvents.filter((e) => e.occurred_on >= monthStart);
  const todayEvents = windowEvents.filter((e) => e.occurred_on === today);
  const [totalEvents, currentStreak, weeklyStreak, monthlyStreak] = await Promise.all([
    store.countEvents(),
    getCodingStreak(store),
    getWeeklyStreak(store),
    getMonthlyStreak(store),
  ]);

  // Hours and days of week come only from today's new events
  // (avoids misfiring time-based achievements from multi-day polling batches)
  const newToday = newEvents.filter((e) => toDateInTimezone(e.occurred_at, timezone) === today);

  return {
    context: {
      todayEvents,
      currentStreak,
      totalEvents,
      weekEvents,
      monthEvents,
      monthPRCount: monthEvents.filter((e) => e.kind === "pr_opened").length,
      weeklyStreak,
      monthlyStreak,
      ...dayFields(todayEvents, newToday, timezone),
    },
    periods: { today, weekStart, monthPeriod: getMonthPeriodFromTimezone(timezone) },
  };
}

/**
 * Replay context builder: the context as it stood at the end of `day`,
 * derived only from `events` (sorted by occurred_at). Later events are ignored.
 */
function buildContextFromEvents(
  events: ActivityEvent[],
  day: string,
  timezone: string
): { context: AchievementContext; periods: EvaluationPeriods } {
  const weekStart = getWeekStartFromDate(day);
  const monthStart = `${day.slice(0, 7)}-01`;
  const upToDay = events.filter((e) => e.occurred_on <= day);
  const todayEvents = upToDay.filter((e) => e.occurred_on === day);
  const monthEvents = upToDay.filter((e) => e.occurred_on >= monthStart);

  return {
    context: {
      todayEvents,
      currentStreak: codingStreakAsOf(upToDay, day),
      totalEvents: upToDay.length,
      weekEvents: upToDay.filter((e) => e.occurred_on >= weekStart),
      monthEvents,
      monthPRCount: monthEvents.filter((e) => e.kind === "pr_opened").length,
      weeklyStreak: weeklyStreakAsOf(upToDay, day),
      monthlyStreak: monthlyStreakAsOf(upToDay, day),
      ...dayFields(todayEvents, todayEvents, timezone),
    },
    periods: { today: day, weekStart, monthPeriod: day.slice(0, 7) },
  };
}

async function recordEarned(
  store: ActivityStore,
  earned: EarnedAchievement[],
  earnedAt: string
): Promise<Achievement[]> {
  const recorded: Achievement[] = [];
  for (const { definition, period } of earned) {
    const inserted = await store.recordAchievement({
      achievement_id: definition.id,
      name: definition.name,
      emoji: definition.emoji,
      description: definition.description,
      period,
      earned_at: earnedAt,
      metadata: {},
    });
    if (inserted) recorded.push(inserted);
  }
  return recorded;
}

/**
 * Check all achievement definitions against current state.
 * Returns newly earned achievements (already inserted into DB).
 */
export async function checkAchievements(
  store: ActivityStore,
  newEvents: { occurred_at: string }[]
): Promise<Achievement[]> {
  const { timezone } = await getSettings();
  const { context, periods } = await buildLiveContext(store, newEvents, timezone);
  return recordEarned(store, evaluateAchievements(context, periods), new Date().toISOString());
}

/**
 * Evaluate every day with activity in [fromDate, toDate] as if it were "today", in order,
 * and record what each earned with its historical period and the time of that day's last
 * event. Posts nothing. Weeks and months are covered because each day sees its week and
 * month to date. Returns how many achievements were recorded.
 */
export async function replayAchievements(store: ActivityStore, fromDate: string, toDate: string): Promise<number> {
  const { timezone } = await getSettings();
  // Streaks look back up to 5 years before the first replayed day
  const events = (await store.eventsInRange(subtractDays(fromDate, 1825), toDate)).sort((a, b) =>
    a.occurred_at.localeCompare(b.occurred_at)
  );
  const days = [...new Set(events.map((e) => e.occurred_on).filter((d) => d >= fromDate))].sort();

  let recorded = 0;
  for (const day of days) {
    const { context, periods } = buildContextFromEvents(events, day, timezone);
    const lastEventOfDay = events.filter((e) => e.occurred_on === day).at(-1)!;
    recorded += (await recordEarned(store, evaluateAchievements(context, periods), lastEventOfDay.occurred_at)).length;
  }
  return recorded;
}
