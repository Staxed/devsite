import type { DiscordEmbed } from "./client";
import type { Achievement } from "@/lib/supabase/types";
import { getSettings } from "@/lib/settings";

export const EMBED_COLORS = {
  SUMMARY: 0x0969da,
  ACHIEVEMENT: 0xffd700,
  STREAK: 0xff6b35,
  STATS: 0x8957e5,
} as const;

// --- Emoji map for all event kinds ---
export const KIND_EMOJI: Record<string, string> = {
  commit_pushed: "\u{1F4DD}",
  pr_opened: "\u{1F500}",
  pr_closed: "\u{1F500}",
  pr_merged: "\u{1F500}",
  issue_opened: "\u{1F41B}",
  issue_closed: "\u{1F41B}",
  release_published: "\u{1F680}",
  review_submitted: "\u{1F440}",
  branch_created: "\u{1F331}",
  tag_created: "\u{1F3F7}\uFE0F",
  branch_deleted: "\u{1F5D1}\uFE0F",
  tag_deleted: "\u{1F5D1}\uFE0F",
  repo_forked: "\u{1F374}",
  repo_starred: "\u2B50",
  issue_comment_created: "\u{1F4AC}",
  pr_comment_created: "\u{1F4AC}",
  commit_comment_created: "\u{1F4AC}",
  member_added: "\u{1F465}",
  member_removed: "\u{1F465}",
  wiki_updated: "\u{1F4DA}",
  repo_made_public: "\u{1F310}",
  discussion_created: "\u{1F4AD}",
  discussion_answered: "\u{1F4AD}",
};

function githubAvatar(username: string): string {
  return `https://github.com/${username}.png`;
}

// --- Stats / Streak / Achievement embeds ---

export async function buildStatsEmbed(
  stats: Record<string, number>,
  period: string,
  label: string
): Promise<DiscordEmbed> {
  const { github_username } = await getSettings();
  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  const fields = Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([kind, count]) => ({
      name: `${KIND_EMOJI[kind] || "\u{1F4CA}"} ${kind.replace(/_/g, " ")}`,
      value: `${count}`,
      inline: true,
    }));

  return {
    title: `\u{1F4CA} ${label} Stats`,
    description: `**${total}** total events for ${period}`,
    color: EMBED_COLORS.STATS,
    thumbnail: { url: githubAvatar(github_username) },
    fields,
  };
}

export async function buildStreakEmbed(
  streaks: { daily: number; weekly: number; monthly: number; yearly: number },
  longest: number
): Promise<DiscordEmbed> {
  const { github_username } = await getSettings();
  const streakEmoji = streaks.daily >= 30 ? "\u{1F48E}" : streaks.daily >= 7 ? "\u{1F525}" : "\u2B50";

  return {
    title: `${streakEmoji} Coding Streaks`,
    color: EMBED_COLORS.STREAK,
    thumbnail: { url: githubAvatar(github_username) },
    fields: [
      { name: "Daily Streak", value: `**${streaks.daily}** day${streaks.daily !== 1 ? "s" : ""}`, inline: true },
      { name: "Weekly Streak", value: `**${streaks.weekly}** week${streaks.weekly !== 1 ? "s" : ""}`, inline: true },
      { name: "Monthly Streak", value: `**${streaks.monthly}** month${streaks.monthly !== 1 ? "s" : ""}`, inline: true },
      { name: "Yearly Streak", value: `**${streaks.yearly}** year${streaks.yearly !== 1 ? "s" : ""}`, inline: true },
      { name: "Longest Daily", value: `**${longest}** day${longest !== 1 ? "s" : ""}`, inline: true },
    ],
  };
}

export async function buildAchievementEmbed(achievement: Achievement): Promise<DiscordEmbed> {
  const { github_username } = await getSettings();
  return {
    title: `\u{1F389} Achievement Unlocked!`,
    description: `${achievement.emoji || "\u{1F3C6}"} **${achievement.name}**\n${achievement.description || ""}`,
    color: EMBED_COLORS.ACHIEVEMENT,
    thumbnail: { url: githubAvatar(github_username) },
    footer: { text: `Earned ${new Date(achievement.earned_at).toLocaleDateString()}` },
  };
}
