import { createAdminClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import {
  getPeriodStats,
  getCodingStreak,
  getLongestStreak,
  getRepoBreakdown,
  getTimePatterns,
} from "@/lib/streaks/engine";
import {
  buildStatsEmbed,
  buildStreakEmbed,
  EMBED_COLORS,
  KIND_EMOJI,
} from "./embeds";
import type { DiscordEmbed } from "./client";

import { todayInTimezone as todayStr, toDateInTimezone } from "@/lib/dates";

interface CommandOption {
  name: string;
  value: string | number;
  options?: CommandOption[];
}

function getOption(options: CommandOption[], name: string): string | number | undefined {
  return options.find((o) => o.name === name)?.value;
}

export async function handleLog(options: CommandOption[]) {
  const category = getOption(options, "category");
  const value = getOption(options, "value");
  const unit = getOption(options, "unit");
  const note = getOption(options, "note") as string | undefined;

  if (!category || typeof category !== "string" || !unit || typeof unit !== "string" || value === undefined || typeof value !== "number") {
    return { content: "Missing or invalid: category, value, unit." };
  }

  const { timezone } = await getSettings();
  const now = new Date().toISOString();
  const supabase = createAdminClient();

  const { error } = await supabase.from("activity_events").insert({
    occurred_at: now,
    occurred_on: toDateInTimezone(now, timezone),
    source: "discord",
    category,
    kind: category,
    value,
    unit,
    title: note || `${category}: ${value} ${unit}`,
    public_summary: `${category}: ${value} ${unit}`,
    visibility: "public",
    metadata: { logged_via: "discord" },
  });

  if (error) {
    return { content: `Failed to log: ${error.message}` };
  }

  return {
    content: `Logged **${value} ${unit}** of **${category}**${note ? ` — ${note}` : ""}`,
  };
}

export async function handleHabitDone(options: CommandOption[]) {
  // Sub-command options are nested
  const subOptions = options[0]?.options || [];
  const name = getOption(subOptions, "name") as string;
  const value = (getOption(subOptions, "value") as number) || 1;

  const supabase = createAdminClient();

  // Find the matching habit
  const { data: habits } = await supabase
    .from("habits")
    .select("*")
    .eq("is_active", true)
    .ilike("name", name);

  const habit = habits?.[0];
  if (!habit) {
    return { content: `No active habit found matching "${name}"` };
  }

  const { timezone } = await getSettings();
  const now = new Date().toISOString();
  const { error } = await supabase.from("activity_events").insert({
    occurred_at: now,
    occurred_on: toDateInTimezone(now, timezone),
    source: "discord",
    category: habit.filters?.category || "habit",
    kind: habit.filters?.kind || habit.name.toLowerCase().replace(/\s+/g, "_"),
    value,
    unit: habit.target_unit,
    title: `${habit.name}: ${value} ${habit.target_unit}`,
    public_summary: `${habit.name}: ${value} ${habit.target_unit}`,
    visibility: habit.visibility,
    metadata: { habit_id: habit.id, logged_via: "discord" },
  });

  if (error) {
    return { content: `Failed to log habit: ${error.message}` };
  }

  return {
    content: `Tracked **${value} ${habit.target_unit}** for **${habit.name}**`,
  };
}

export async function handleStats(options: CommandOption[]) {
  const { timezone } = await getSettings();
  const period = getOption(options, "period") as string;
  const today = todayStr(timezone);

  let startDate: string;
  let label: string;

  switch (period) {
    case "day":
      startDate = today;
      label = "Today";
      break;
    case "week": {
      const d = new Date();
      const tz = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
      const day = tz.getDay();
      tz.setDate(tz.getDate() - (day === 0 ? 6 : day - 1));
      startDate = tz.toISOString().split("T")[0];
      label = "This Week";
      break;
    }
    case "month": {
      const d = new Date();
      const tz = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
      startDate = `${tz.getFullYear()}-${String(tz.getMonth() + 1).padStart(2, "0")}-01`;
      label = "This Month";
      break;
    }
    case "year": {
      const d = new Date();
      const tz = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
      startDate = `${tz.getFullYear()}-01-01`;
      label = "This Year";
      break;
    }
    default:
      startDate = today;
      label = "Today";
  }

  const stats = await getPeriodStats(startDate, today);
  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  const lines = [`**${label} Stats** (${total} total events)`];
  for (const [kind, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    lines.push(`• ${kind.replace(/_/g, " ")}: **${count}**`);
  }

  if (Object.keys(stats).length === 0) {
    lines.push("No activity recorded for this period.");
  }

  return { content: lines.join("\n") };
}

// --- Activity subcommand handlers ---

async function getDateRange(period: string): Promise<{ startDate: string; endDate: string; label: string }> {
  const { timezone } = await getSettings();
  const today = todayStr(timezone);
  switch (period) {
    case "day":
      return { startDate: today, endDate: today, label: "Today" };
    case "week": {
      const d = new Date();
      const tz = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
      const day = tz.getDay();
      tz.setDate(tz.getDate() - (day === 0 ? 6 : day - 1));
      return { startDate: tz.toISOString().split("T")[0], endDate: today, label: "This Week" };
    }
    case "month": {
      const d = new Date();
      const tz = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
      return {
        startDate: `${tz.getFullYear()}-${String(tz.getMonth() + 1).padStart(2, "0")}-01`,
        endDate: today,
        label: "This Month",
      };
    }
    case "year": {
      const d = new Date();
      const tz = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
      return { startDate: `${tz.getFullYear()}-01-01`, endDate: today, label: "This Year" };
    }
    default:
      return { startDate: today, endDate: today, label: "Today" };
  }
}

export async function handleActivityStats(options: CommandOption[]) {
  const timeframe = (getOption(options, "timeframe") as string) || "week";
  const { startDate, endDate, label } = await getDateRange(timeframe);
  const stats = await getPeriodStats(startDate, endDate);
  const embed = await buildStatsEmbed(stats, `${startDate} to ${endDate}`, label);
  return { embeds: [embed] };
}

export async function handleActivityStreak() {
  const current = await getCodingStreak();
  const longest = await getLongestStreak();
  const embed = await buildStreakEmbed(current, longest);
  return { embeds: [embed] };
}

export async function handleActivityRepos(options: CommandOption[]) {
  const timeframe = (getOption(options, "timeframe") as string) || "week";
  const { startDate, endDate, label } = await getDateRange(timeframe);
  const repos = await getRepoBreakdown(startDate, endDate);

  const sorted = Object.entries(repos).sort((a, b) => b[1] - a[1]).slice(0, 15);

  const fields = sorted.map(([repo, count]) => ({
    name: repo,
    value: `${count} event${count !== 1 ? "s" : ""}`,
    inline: true,
  }));

  const embed: DiscordEmbed = {
    title: `\u{1F4C1} Repo Activity — ${label}`,
    description: sorted.length > 0
      ? `**${sorted.length}** active repo${sorted.length !== 1 ? "s" : ""}`
      : "No repo activity for this period.",
    color: EMBED_COLORS.STATS,
    fields,
  };

  return { embeds: [embed] };
}

export async function handleActivityInsights() {
  const { timezone } = await getSettings();
  const today = todayStr(timezone);
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
  const startDate = `${tz.getFullYear()}-${String(tz.getMonth() + 1).padStart(2, "0")}-01`;

  const { hourly, daily } = await getTimePatterns(startDate, today);

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const peakHour = Object.entries(hourly).sort((a, b) => b[1] - a[1])[0];
  const peakDay = Object.entries(daily).sort((a, b) => b[1] - a[1])[0];

  const hourBars = Array.from({ length: 24 }, (_, h) => {
    const count = hourly[h] || 0;
    const bar = "\u2588".repeat(Math.min(Math.ceil(count / 2), 15));
    return `\`${String(h).padStart(2, "0")}:00\` ${bar} ${count}`;
  })
    .filter((_, h) => (hourly[h] || 0) > 0)
    .join("\n");

  const dayBars = dayNames
    .map((name, i) => {
      const count = daily[i] || 0;
      const bar = "\u2588".repeat(Math.min(Math.ceil(count / 2), 15));
      return `\`${name}\` ${bar} ${count}`;
    })
    .join("\n");

  const embed: DiscordEmbed = {
    title: "\u{1F4CA} Activity Insights — This Month",
    color: EMBED_COLORS.STATS,
    fields: [
      {
        name: "Peak Hour",
        value: peakHour ? `${peakHour[0]}:00 (${peakHour[1]} events)` : "N/A",
        inline: true,
      },
      {
        name: "Peak Day",
        value: peakDay ? `${dayNames[Number(peakDay[0])]} (${peakDay[1]} events)` : "N/A",
        inline: true,
      },
      { name: "Hourly Distribution", value: hourBars || "No data", inline: false },
      { name: "Daily Distribution", value: dayBars, inline: false },
    ],
  };

  return { embeds: [embed] };
}

export async function handleActivityBadges() {
  const supabase = createAdminClient();

  const { data: achievements } = await supabase
    .from("achievements")
    .select("*")
    .order("earned_at", { ascending: false })
    .limit(25);

  if (!achievements || achievements.length === 0) {
    return { content: "No achievements earned yet. Keep coding!" };
  }

  const lines = achievements.map((a) => {
    const emoji = a.emoji || "\u{1F3C6}";
    const date = new Date(a.earned_at).toLocaleDateString();
    return `${emoji} **${a.name}** — ${a.description || ""} (${date})`;
  });

  const embed: DiscordEmbed = {
    title: `\u{1F3C6} Achievements (${achievements.length})`,
    description: lines.join("\n"),
    color: EMBED_COLORS.ACHIEVEMENT,
  };

  return { embeds: [embed] };
}
