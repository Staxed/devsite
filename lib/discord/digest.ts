import type { ActivityStore } from "@/lib/activity/store";
import type { ActivityEvent } from "@/lib/supabase/types";
import { checkAchievements } from "@/lib/achievements/engine";
import { getSettings } from "@/lib/settings";
import { sendEmbeds, type DiscordEmbed } from "./client";
import { buildAchievementEmbed, EMBED_COLORS } from "./embeds";

const HOUR_MS = 3_600_000;
const DIGEST_WINDOW_MS = 24 * HOUR_MS;
const PRIVATE_REPO_NAME = "Private repo";

/** Counted kinds in line order; kinds sharing a label are summed. */
const COUNT_LABELS: { kinds: string[]; singular: string; plural: string }[] = [
  { kinds: ["commit_pushed"], singular: "commit", plural: "commits" },
  { kinds: ["pr_opened"], singular: "PR opened", plural: "PRs opened" },
  { kinds: ["pr_merged"], singular: "PR merged", plural: "PRs merged" },
  { kinds: ["pr_closed"], singular: "PR closed", plural: "PRs closed" },
  { kinds: ["branch_created"], singular: "branch created", plural: "branches created" },
  { kinds: ["branch_deleted"], singular: "branch deleted", plural: "branches deleted" },
  { kinds: ["tag_created"], singular: "tag created", plural: "tags created" },
  { kinds: ["tag_deleted"], singular: "tag deleted", plural: "tags deleted" },
  { kinds: ["issue_opened"], singular: "issue opened", plural: "issues opened" },
  { kinds: ["issue_closed"], singular: "issue closed", plural: "issues closed" },
  { kinds: ["review_submitted"], singular: "review", plural: "reviews" },
  { kinds: ["release_published"], singular: "release", plural: "releases" },
  { kinds: ["issue_comment_created", "pr_comment_created", "commit_comment_created"], singular: "comment", plural: "comments" },
];
const COUNTED_KINDS = new Set(COUNT_LABELS.flatMap((l) => l.kinds));

/** The counts part of a repo line, e.g. "5 commits · 1 PR merged · +120 / −34 lines". Empty when nothing counts. */
export function formatRepoCounts(events: ActivityEvent[]): string {
  const parts: string[] = [];
  for (const { kinds, singular, plural } of COUNT_LABELS) {
    const n = events.filter((e) => kinds.includes(e.kind)).length;
    if (n > 0) parts.push(`${n} ${n === 1 ? singular : plural}`);
  }
  const commits = events.filter((e) => e.kind === "commit_pushed");
  const added = commits.reduce((sum, e) => sum + (e.lines_added ?? 0), 0);
  const removed = commits.reduce((sum, e) => sum + (e.lines_removed ?? 0), 0);
  if (added > 0 || removed > 0) parts.push(`+${added} / −${removed} lines`);
  return parts.join(" · ");
}

/** The name a repo shows under in Discord: its display name, else the short name when all events are public, else "Private repo". */
export function repoDisplayName(repo: string, displayName: string | null, events: ActivityEvent[]): string {
  const allPublic = events.every((e) => e.repo_visibility === "public");
  return displayName?.trim() || (allPublic ? repo.split("/")[1] : PRIVATE_REPO_NAME);
}

function repoLine(repo: string, displayName: string | null, events: ActivityEvent[]): string {
  const allPublic = events.every((e) => e.repo_visibility === "public");
  const name = repoDisplayName(repo, displayName, events);
  const label = allPublic ? `[${name}](https://github.com/${repo})` : name;
  return `**${label}**: ${formatRepoCounts(events)}`;
}

/** "Activity · Sat Nov 7, 2:00 PM – 2:59 PM EST" for the clock hour starting at hourStart. */
function digestTitle(hourStart: Date, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      hour12: true,
      timeZoneName: "short",
    })
      .formatToParts(hourStart)
      .map((p) => [p.type, p.value])
  );
  const hour = `${parts.hour}:00 ${parts.dayPeriod}`;
  const lastMinute = `${parts.hour}:59 ${parts.dayPeriod}`;
  return `Activity · ${parts.weekday} ${parts.month} ${parts.day}, ${hour} – ${lastMinute} ${parts.timeZoneName}`;
}

/**
 * Claim every unhandled event from before the current clock hour, post one embed with a line per
 * included repo that had counted activity (busiest first), then post new achievements.
 *
 * Events older than 24 hours are claimed without posting. If the send fails the claim is
 * released so the next digest posts the events, and achievements are skipped.
 * Returns how many repo lines were posted.
 */
export async function postHourlyDigest(store: ActivityStore, channelId: string, now: Date): Promise<number> {
  const { timezone } = await getSettings();
  const currentHourStart = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
  const windowStart = currentHourStart.getTime() - DIGEST_WINDOW_MS;

  const claimed = await store.claimUnhandledEvents(
    new Date(0).toISOString(),
    new Date(currentHourStart.getTime() - 1).toISOString()
  );
  if (claimed.length === 0) return 0;

  const included = new Map(
    (await store.listDiscordRepos()).filter((r) => r.included).map((r) => [r.repo_full_name, r.display_name])
  );
  const byRepo = new Map<string, ActivityEvent[]>();
  for (const e of claimed) {
    const repo = e.metadata.repo as string | undefined;
    if (Date.parse(e.occurred_at) < windowStart || e.source !== "github" || !repo || !included.has(repo) || !COUNTED_KINDS.has(e.kind)) {
      continue;
    }
    byRepo.set(repo, [...(byRepo.get(repo) ?? []), e]);
  }

  if (byRepo.size > 0) {
    const lines = [...byRepo]
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([repo, events]) => repoLine(repo, included.get(repo) ?? null, events));
    const embed: DiscordEmbed = {
      title: digestTitle(new Date(currentHourStart.getTime() - HOUR_MS), timezone),
      description: lines.join("\n"),
      color: EMBED_COLORS.SUMMARY,
    };

    let messageIds: string[];
    try {
      messageIds = await sendEmbeds(channelId, [embed]);
    } catch (error) {
      await store.releaseEvents(claimed.map((e) => e.id));
      throw error;
    }
    if (messageIds.length === 0) {
      await store.releaseEvents(claimed.map((e) => e.id));
      throw new Error(`Hourly digest send to Discord channel ${channelId} failed; claim released`);
    }
    await store.recordDiscordPost({
      delivery_id: `digest-${currentHourStart.toISOString()}-${Math.min(...claimed.map((e) => e.id))}`,
      channel_id: channelId,
      message_id: messageIds[0],
      events_count: [...byRepo.values()].reduce((sum, events) => sum + events.length, 0),
    });
  }

  const achievements = await checkAchievements(store, claimed);
  if (achievements.length > 0) {
    await sendEmbeds(channelId, await Promise.all(achievements.map(buildAchievementEmbed)));
  }
  return byRepo.size;
}
