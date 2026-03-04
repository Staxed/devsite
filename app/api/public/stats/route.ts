import { NextResponse } from "next/server";
import { getPeriodStats } from "@/lib/streaks/engine";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const { timezone } = await getSettings();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone });

  const weekD = new Date();
  const weekTz = new Date(weekD.toLocaleString("en-US", { timeZone: timezone }));
  const day = weekTz.getDay();
  weekTz.setDate(weekTz.getDate() - (day === 0 ? 6 : day - 1));
  const weekStart = weekTz.toISOString().split("T")[0];

  const monthD = new Date();
  const monthTz = new Date(monthD.toLocaleString("en-US", { timeZone: timezone }));
  const monthStart = `${monthTz.getFullYear()}-${String(monthTz.getMonth() + 1).padStart(2, "0")}-01`;

  const [todayStats, weekStats, monthStats] = await Promise.all([
    getPeriodStats(today, today),
    getPeriodStats(weekStart, today),
    getPeriodStats(monthStart, today),
  ]);

  return NextResponse.json({ today: todayStats, week: weekStats, month: monthStats });
}
