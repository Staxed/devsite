import { NextResponse } from "next/server";
import { getPeriodStats } from "@/lib/streaks/engine";
import { getSettings } from "@/lib/settings";
import { todayInTimezone, getWeekStartFromTimezone, getMonthStartFromTimezone } from "@/lib/dates";

export async function GET() {
  const { timezone } = await getSettings();

  const today = todayInTimezone(timezone);
  const weekStart = getWeekStartFromTimezone(timezone);
  const monthStart = getMonthStartFromTimezone(timezone);

  const [todayStats, weekStats, monthStats] = await Promise.all([
    getPeriodStats(today, today),
    getPeriodStats(weekStart, today),
    getPeriodStats(monthStart, today),
  ]);

  return NextResponse.json({ today: todayStats, week: weekStats, month: monthStats });
}
