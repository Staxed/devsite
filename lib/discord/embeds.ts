import type { DiscordEmbed } from "./client";
import type { ActivityEvent, Achievement } from "@/lib/supabase/types";
import { getSettings } from "@/lib/settings";

// --- Color constants matching activity-bot ---
export const EMBED_COLORS = {
  COMMIT: 0x28a745,
  PR: 0x6f42c1,
  ISSUE: 0xcf222e,
  RELEASE: 0xffc107,
  REVIEW: 0xb19cd9,
  BRANCH_CREATE: 0x20c997,
  BRANCH_DELETE: 0x1a1a2e,
  FORK: 0xc0c0c0,
  STAR: 0xffd700,
  COMMENT: 0x8b949e,
  MEMBER: 0x58a6ff,
  WIKI: 0x8b4513,
  PUBLIC: 0x2ea043,
  DISCUSSION: 0xf78166,
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

const MAX_ITEMS = 10;

function githubAvatar(username: string): string {
  return `https://github.com/${username}.png`;
}

// --- Helpers ---

function formatItem(event: ActivityEvent): string {
  const isPublic = event.visibility === "public";
  const title = event.title || "Activity";
  const repo = (event.metadata?.repo as string) || "";

  if (isPublic && event.url) {
    return `[${title}](${event.url}) in ${repo}`;
  }
  if (!isPublic) {
    return `${title} [Private Repo]`;
  }
  return `${title}${repo ? ` in ${repo}` : ""}`;
}

function discordTimestamp(isoDate: string): string {
  const unix = Math.floor(new Date(isoDate).getTime() / 1000);
  return `<t:${unix}:t>`;
}

function sortEvents(events: ActivityEvent[]): ActivityEvent[] {
  return [...events].sort((a, b) => {
    // Public first
    if (a.visibility !== b.visibility) return a.visibility === "public" ? -1 : 1;
    // Newest first
    return b.occurred_at.localeCompare(a.occurred_at);
  });
}

function buildItemList(events: ActivityEvent[]): string {
  const sorted = sortEvents(events);
  const shown = sorted.slice(0, MAX_ITEMS);
  const lines = shown.map(
    (e) => `${discordTimestamp(e.occurred_at)} ${formatItem(e)}`
  );
  if (sorted.length > MAX_ITEMS) {
    lines.push(`... and ${sorted.length - MAX_ITEMS} more`);
  }
  return lines.join("\n");
}

function footerWithCount(count: number, label: string): { text: string } | undefined {
  if (count <= MAX_ITEMS) return undefined;
  return { text: `Showing ${MAX_ITEMS} of ${count} ${label}` };
}

// --- Summary embed ---

export async function buildSummaryEmbed(events: ActivityEvent[]): Promise<DiscordEmbed> {
  const { github_username } = await getSettings();
  const kindCounts: Record<string, number> = {};
  const repos = new Set<string>();

  for (const e of events) {
    kindCounts[e.kind] = (kindCounts[e.kind] || 0) + 1;
    const repo = e.metadata?.repo as string;
    if (repo) repos.add(repo);
  }

  const fields = Object.entries(kindCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([kind, count]) => ({
      name: `${KIND_EMOJI[kind] || "\u{1F4CA}"} ${kind.replace(/_/g, " ")}`,
      value: `${count}`,
      inline: true,
    }));

  return {
    title: `${github_username} on GitHub`,
    description: `**${events.length}** events across **${repos.size}** repo${repos.size !== 1 ? "s" : ""}`,
    color: EMBED_COLORS.SUMMARY,
    thumbnail: { url: githubAvatar(github_username) },
    fields,
  };
}

// --- Per-type embed builders ---

export function buildCommitsEmbed(events: ActivityEvent[]): DiscordEmbed {
  return {
    title: `\u{1F4DD} Commits (${events.length})`,
    description: buildItemList(events),
    color: EMBED_COLORS.COMMIT,
    footer: footerWithCount(events.length, "commits"),
  };
}

export function buildPRsEmbed(events: ActivityEvent[]): DiscordEmbed {
  const items = sortEvents(events).slice(0, MAX_ITEMS);
  const lines = items.map((e) => {
    const stateEmoji =
      e.kind === "pr_merged" ? "\u{1F7E3}" : e.kind === "pr_opened" ? "\u{1F7E2}" : "\u{1F534}";
    return `${stateEmoji} ${discordTimestamp(e.occurred_at)} ${formatItem(e)}`;
  });
  if (events.length > MAX_ITEMS) lines.push(`... and ${events.length - MAX_ITEMS} more`);

  return {
    title: `\u{1F500} Pull Requests (${events.length})`,
    description: lines.join("\n"),
    color: EMBED_COLORS.PR,
    footer: footerWithCount(events.length, "PRs"),
  };
}

export function buildIssuesEmbed(events: ActivityEvent[]): DiscordEmbed {
  return {
    title: `\u{1F41B} Issues (${events.length})`,
    description: buildItemList(events),
    color: EMBED_COLORS.ISSUE,
    footer: footerWithCount(events.length, "issues"),
  };
}

export function buildReleasesEmbed(events: ActivityEvent[]): DiscordEmbed {
  return {
    title: `\u{1F680} Releases (${events.length})`,
    description: buildItemList(events),
    color: EMBED_COLORS.RELEASE,
    footer: footerWithCount(events.length, "releases"),
  };
}

export function buildReviewsEmbed(events: ActivityEvent[]): DiscordEmbed {
  const items = sortEvents(events).slice(0, MAX_ITEMS);
  const lines = items.map((e) => {
    const state = e.metadata?.state as string;
    const stateEmoji = state === "approved" ? "\u2705" : "\u{1F504}";
    return `${stateEmoji} ${discordTimestamp(e.occurred_at)} ${formatItem(e)}`;
  });
  if (events.length > MAX_ITEMS) lines.push(`... and ${events.length - MAX_ITEMS} more`);

  return {
    title: `\u{1F440} Reviews (${events.length})`,
    description: lines.join("\n"),
    color: EMBED_COLORS.REVIEW,
    footer: footerWithCount(events.length, "reviews"),
  };
}

export function buildCreationsEmbed(events: ActivityEvent[]): DiscordEmbed {
  return {
    title: `\u{1F331} Branches & Tags Created (${events.length})`,
    description: buildItemList(events),
    color: EMBED_COLORS.BRANCH_CREATE,
    footer: footerWithCount(events.length, "items"),
  };
}

export function buildDeletionsEmbed(events: ActivityEvent[]): DiscordEmbed {
  return {
    title: `\u{1F5D1}\uFE0F Branches & Tags Deleted (${events.length})`,
    description: buildItemList(events),
    color: EMBED_COLORS.BRANCH_DELETE,
    footer: footerWithCount(events.length, "items"),
  };
}

export function buildForksEmbed(events: ActivityEvent[]): DiscordEmbed {
  return {
    title: `\u{1F374} Forks (${events.length})`,
    description: buildItemList(events),
    color: EMBED_COLORS.FORK,
    footer: footerWithCount(events.length, "forks"),
  };
}

export function buildStarsEmbed(events: ActivityEvent[]): DiscordEmbed {
  return {
    title: `\u2B50 Stars (${events.length})`,
    description: buildItemList(events),
    color: EMBED_COLORS.STAR,
    footer: footerWithCount(events.length, "stars"),
  };
}

export function buildCommentsEmbed(events: ActivityEvent[]): DiscordEmbed {
  return {
    title: `\u{1F4AC} Comments (${events.length})`,
    description: buildItemList(events),
    color: EMBED_COLORS.COMMENT,
    footer: footerWithCount(events.length, "comments"),
  };
}

export function buildMembersEmbed(events: ActivityEvent[]): DiscordEmbed {
  const items = sortEvents(events).slice(0, MAX_ITEMS);
  const lines = items.map((e) => {
    const emoji = e.kind === "member_added" ? "\u2795" : "\u2796";
    return `${emoji} ${discordTimestamp(e.occurred_at)} ${formatItem(e)}`;
  });
  if (events.length > MAX_ITEMS) lines.push(`... and ${events.length - MAX_ITEMS} more`);

  return {
    title: `\u{1F465} Members (${events.length})`,
    description: lines.join("\n"),
    color: EMBED_COLORS.MEMBER,
    footer: footerWithCount(events.length, "changes"),
  };
}

export function buildWikiEmbed(events: ActivityEvent[]): DiscordEmbed {
  return {
    title: `\u{1F4DA} Wiki Updates (${events.length})`,
    description: buildItemList(events),
    color: EMBED_COLORS.WIKI,
    footer: footerWithCount(events.length, "updates"),
  };
}

export function buildPublicEmbed(events: ActivityEvent[]): DiscordEmbed {
  return {
    title: `\u{1F310} Repos Made Public (${events.length})`,
    description: buildItemList(events),
    color: EMBED_COLORS.PUBLIC,
    footer: footerWithCount(events.length, "repos"),
  };
}

export function buildDiscussionsEmbed(events: ActivityEvent[]): DiscordEmbed {
  return {
    title: `\u{1F4AD} Discussions (${events.length})`,
    description: buildItemList(events),
    color: EMBED_COLORS.DISCUSSION,
    footer: footerWithCount(events.length, "discussions"),
  };
}

// --- Grouped embed builder ---

const KIND_GROUPS: Record<string, { builder: (events: ActivityEvent[]) => DiscordEmbed; priority: number }> = {
  commit_pushed: { builder: buildCommitsEmbed, priority: 1 },
  pr_opened: { builder: buildPRsEmbed, priority: 2 },
  pr_closed: { builder: buildPRsEmbed, priority: 2 },
  pr_merged: { builder: buildPRsEmbed, priority: 2 },
  issue_opened: { builder: buildIssuesEmbed, priority: 3 },
  issue_closed: { builder: buildIssuesEmbed, priority: 3 },
  release_published: { builder: buildReleasesEmbed, priority: 4 },
  review_submitted: { builder: buildReviewsEmbed, priority: 5 },
  branch_created: { builder: buildCreationsEmbed, priority: 6 },
  tag_created: { builder: buildCreationsEmbed, priority: 6 },
  branch_deleted: { builder: buildDeletionsEmbed, priority: 7 },
  tag_deleted: { builder: buildDeletionsEmbed, priority: 7 },
  repo_forked: { builder: buildForksEmbed, priority: 8 },
  repo_starred: { builder: buildStarsEmbed, priority: 9 },
  issue_comment_created: { builder: buildCommentsEmbed, priority: 10 },
  pr_comment_created: { builder: buildCommentsEmbed, priority: 10 },
  commit_comment_created: { builder: buildCommentsEmbed, priority: 10 },
  member_added: { builder: buildMembersEmbed, priority: 11 },
  member_removed: { builder: buildMembersEmbed, priority: 11 },
  wiki_updated: { builder: buildWikiEmbed, priority: 12 },
  repo_made_public: { builder: buildPublicEmbed, priority: 13 },
  discussion_created: { builder: buildDiscussionsEmbed, priority: 14 },
  discussion_answered: { builder: buildDiscussionsEmbed, priority: 14 },
};

/**
 * Groups events by kind, builds summary + per-type embeds, max 10 total.
 */
export async function buildGroupedEmbeds(events: ActivityEvent[]): Promise<DiscordEmbed[]> {
  if (events.length === 0) return [];

  const embeds: DiscordEmbed[] = [await buildSummaryEmbed(events)];

  // Group events by their embed builder
  const groups = new Map<(events: ActivityEvent[]) => DiscordEmbed, { priority: number; events: ActivityEvent[] }>();

  for (const event of events) {
    const config = KIND_GROUPS[event.kind];
    if (!config) continue;

    const existing = groups.get(config.builder);
    if (existing) {
      existing.events.push(event);
    } else {
      groups.set(config.builder, { priority: config.priority, events: [event] });
    }
  }

  // Sort by priority and build embeds
  const sorted = [...groups.entries()].sort((a, b) => a[1].priority - b[1].priority);

  for (const [builder, { events: groupEvents }] of sorted) {
    if (embeds.length >= 10) break;
    embeds.push(builder(groupEvents));
  }

  return embeds;
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
  current: number,
  longest: number
): Promise<DiscordEmbed> {
  const { github_username } = await getSettings();
  const streakEmoji = current >= 30 ? "\u{1F48E}" : current >= 7 ? "\u{1F525}" : "\u2B50";

  return {
    title: `${streakEmoji} Coding Streak`,
    color: EMBED_COLORS.STREAK,
    thumbnail: { url: githubAvatar(github_username) },
    fields: [
      { name: "Current Streak", value: `**${current}** day${current !== 1 ? "s" : ""}`, inline: true },
      { name: "Longest Streak", value: `**${longest}** day${longest !== 1 ? "s" : ""}`, inline: true },
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
