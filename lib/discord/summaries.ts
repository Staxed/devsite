import { createAdminClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getPeriodStats, getCodingStreak } from "@/lib/streaks/engine";
import type { DiscordEmbed } from "./client";
import { EMBED_COLORS, KIND_EMOJI } from "./embeds";

import { todayInTimezone, yesterdayInTimezone, getWeekStartFromTimezone as getWeekStart } from "@/lib/dates";

function getMonthStart(tz: string): string {
  const d = new Date();
  const tz2 = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  return `${tz2.getFullYear()}-${String(tz2.getMonth() + 1).padStart(2, "0")}-01`;
}

function getPreviousWeekStart(tz: string): string {
  const d = new Date();
  const tz2 = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  const day = tz2.getDay();
  tz2.setDate(tz2.getDate() - (day === 0 ? 6 : day - 1) - 7);
  return tz2.toISOString().split("T")[0];
}

function getPreviousWeekEnd(tz: string): string {
  const d = new Date();
  const tz2 = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  const day = tz2.getDay();
  tz2.setDate(tz2.getDate() - (day === 0 ? 6 : day - 1) - 1);
  return tz2.toISOString().split("T")[0];
}

function getPreviousMonthRange(tz: string): { start: string; end: string; label: string } {
  const d = new Date();
  const tz2 = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  const year = tz2.getFullYear();
  const month = tz2.getMonth(); // Previous month (0-indexed, so current month - 1)
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 12 : month;
  const lastDay = new Date(prevYear, prevMonth, 0).getDate();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return {
    start: `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`,
    end: `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    label: `${monthNames[prevMonth - 1]} ${prevYear}`,
  };
}

function dailyBadge(total: number): string {
  if (total >= 10) return "\u{1F525} Productive day!";
  if (total === 0) return "\u{1F4A4} Rest day";
  return "\u2728 Keep coding!";
}

function weeklyBadge(total: number): string {
  if (total >= 25) return "\u{1F680} Amazing week!";
  if (total >= 10) return "\u2728 Great week!";
  if (total > 0) return "\u{1F44D} Solid week!";
  return "\u{1F4A4} Quiet week";
}

function monthlyBadge(total: number): string {
  if (total >= 100) return "\u{1F4AF} Century month!";
  if (total >= 50) return "\u{1F680} Incredible month!";
  if (total >= 25) return "\u2728 Great month!";
  if (total > 0) return "\u{1F44D} Active month!";
  return "\u{1F4A4} Quiet month";
}

function buildStatsFields(stats: Record<string, number>): { name: string; value: string; inline: boolean }[] {
  return Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([kind, count]) => ({
      name: `${KIND_EMOJI[kind] || "\u{1F4CA}"} ${kind.replace(/_/g, " ")}`,
      value: `${count}`,
      inline: true,
    }));
}

// --- Summary builders ---

export async function buildDailySummaryEmbed(): Promise<{ embed: DiscordEmbed; total: number }> {
  const { github_username, timezone } = await getSettings();
  const avatarUrl = `https://github.com/${github_username}.png`;
  const yesterday = yesterdayInTimezone(timezone);
  const stats = await getPeriodStats(yesterday, yesterday);
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const streak = await getCodingStreak();

  const embed: DiscordEmbed = {
    title: `\u{1F4CA} Daily Summary — ${yesterday}`,
    description: `**${total}** events | Streak: **${streak}** day${streak !== 1 ? "s" : ""}`,
    color: EMBED_COLORS.SUMMARY,
    thumbnail: { url: avatarUrl },
    fields: buildStatsFields(stats),
    footer: { text: dailyBadge(total) },
  };

  return { embed, total };
}

export async function buildWeeklySummaryEmbed(): Promise<{ embed: DiscordEmbed; total: number }> {
  const { github_username, timezone } = await getSettings();
  const avatarUrl = `https://github.com/${github_username}.png`;
  const start = getPreviousWeekStart(timezone);
  const end = getPreviousWeekEnd(timezone);
  const stats = await getPeriodStats(start, end);
  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  // Count active days
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("activity_events")
    .select("occurred_on")
    .gte("occurred_on", start)
    .lte("occurred_on", end);
  const activeDays = new Set(data?.map((e) => e.occurred_on)).size;

  const embed: DiscordEmbed = {
    title: `\u{1F4C5} Weekly Summary — ${start} to ${end}`,
    description: `**${total}** events over **${activeDays}** active day${activeDays !== 1 ? "s" : ""}`,
    color: EMBED_COLORS.SUMMARY,
    thumbnail: { url: avatarUrl },
    fields: buildStatsFields(stats),
    footer: { text: weeklyBadge(total) },
  };

  return { embed, total };
}

export async function buildMonthlySummaryEmbed(): Promise<{ embed: DiscordEmbed; total: number }> {
  const { github_username, timezone } = await getSettings();
  const avatarUrl = `https://github.com/${github_username}.png`;
  const { start, end, label } = getPreviousMonthRange(timezone);
  const stats = await getPeriodStats(start, end);
  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  const embed: DiscordEmbed = {
    title: `\u{1F4CA} Monthly Summary — ${label}`,
    description: `**${total}** events`,
    color: EMBED_COLORS.SUMMARY,
    thumbnail: { url: avatarUrl },
    fields: buildStatsFields(stats),
    footer: { text: monthlyBadge(total) },
  };

  return { embed, total };
}

/**
 * Determine which summaries to send and return them.
 */
export async function getSummariesToSend(): Promise<
  { type: "daily" | "weekly" | "monthly"; embed: DiscordEmbed; total: number; period: string }[]
> {
  const { timezone } = await getSettings();
  const summaries: { type: "daily" | "weekly" | "monthly"; embed: DiscordEmbed; total: number; period: string }[] = [];
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
  const dayOfWeek = tz.getDay(); // 0 = Sunday
  const dayOfMonth = tz.getDate();

  // Always send daily
  const daily = await buildDailySummaryEmbed();
  summaries.push({ type: "daily", ...daily, period: yesterdayInTimezone(timezone) });

  // Weekly on Monday
  if (dayOfWeek === 1) {
    const weekly = await buildWeeklySummaryEmbed();
    const weekStart = getPreviousWeekStart(timezone);
    summaries.push({ type: "weekly", ...weekly, period: weekStart });
  }

  // Monthly on the 1st
  if (dayOfMonth === 1) {
    const monthly = await buildMonthlySummaryEmbed();
    const { start } = getPreviousMonthRange(timezone);
    summaries.push({ type: "monthly", ...monthly, period: start.slice(0, 7) });
  }

  return summaries;
}
