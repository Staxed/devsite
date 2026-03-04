import { NextResponse } from "next/server";
import { getPeriodStats } from "@/lib/streaks/engine";
import { TIMEZONE } from "@/lib/constants";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

function weekStartStr(): string {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: TIMEZONE }));
  const day = tz.getDay();
  tz.setDate(tz.getDate() - (day === 0 ? 6 : day - 1)); // Monday
  return tz.toISOString().split("T")[0];
}

function monthStartStr(): string {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: TIMEZONE }));
  return `${tz.getFullYear()}-${String(tz.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET() {
  const today = todayStr();

  const [todayStats, weekStats, monthStats] = await Promise.all([
    getPeriodStats(today, today),
    getPeriodStats(weekStartStr(), today),
    getPeriodStats(monthStartStr(), today),
  ]);

  return NextResponse.json({ today: todayStats, week: weekStats, month: monthStats });
}
