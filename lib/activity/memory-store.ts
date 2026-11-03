import type { Achievement, ActivityEvent } from "@/lib/supabase/types";
import type { ActivityStore, DiscordPostRecord } from "./store";

/** In-memory ActivityStore with the same claim semantics as the Supabase one; backs the tests. */
export function createMemoryStore(): ActivityStore & {
  events: ActivityEvent[];
  summaries: { summary_type: string; period: string; message_id?: string }[];
  achievements: Achievement[];
  discordPosts: DiscordPostRecord[];
} {
  const events: ActivityEvent[] = [];
  const summaries: { summary_type: string; period: string; message_id?: string }[] = [];
  const achievements: Achievement[] = [];
  const discordPosts: DiscordPostRecord[] = [];
  let nextId = 1;

  return {
    events,
    summaries,
    achievements,
    discordPosts,

    async upsertEvents(incoming) {
      for (const event of incoming) {
        if (event.dedupe_key && events.some((e) => e.dedupe_key === event.dedupe_key)) continue;
        events.push({
          posted_to_discord: false,
          ...event,
          id: nextId++,
          created_at: new Date().toISOString(),
        });
      }
    },

    async claimEvents(dedupeKeys) {
      const claimed = events.filter(
        (e) => e.dedupe_key && dedupeKeys.includes(e.dedupe_key) && !e.posted_to_discord
      );
      for (const e of claimed) e.posted_to_discord = true;
      return claimed.map((e) => ({ ...e })).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    },

    async findUnpostedEvents(from, to) {
      return events
        .filter((e) => !e.posted_to_discord && e.occurred_at >= from && e.occurred_at <= to)
        .map((e) => ({ ...e }))
        .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    },

    async claimSummary({ summary_type, period }) {
      if (summaries.some((s) => s.summary_type === summary_type && s.period === period)) return false;
      summaries.push({ summary_type, period });
      return true;
    },

    async setSummaryMessageId(summaryType, period, messageId) {
      const row = summaries.find((s) => s.summary_type === summaryType && s.period === period);
      if (!row) throw new Error(`No summary claimed for ${summaryType} ${period}`);
      row.message_id = messageId;
    },

    async recordAchievement(achievement) {
      if (achievements.some((a) => a.achievement_id === achievement.achievement_id && a.period === achievement.period)) {
        return null;
      }
      const row: Achievement = { ...achievement, id: nextId++, created_at: new Date().toISOString() };
      achievements.push(row);
      return row;
    },

    async eventsInRange(fromDate, toDate) {
      return events.filter((e) => e.occurred_on >= fromDate && e.occurred_on <= toDate).map((e) => ({ ...e }));
    },

    async countEvents() {
      return events.length;
    },

    async recordDiscordPost(post) {
      discordPosts.push(post);
    },
  };
}
