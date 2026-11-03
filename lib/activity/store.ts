import { createAdminClient } from "@/lib/supabase/server";
import type { Achievement, ActivityEvent } from "@/lib/supabase/types";

export type NewEvent = Omit<ActivityEvent, "id" | "created_at">;

export type NewAchievement = Omit<Achievement, "id" | "created_at">;

export interface SummaryClaim {
  summary_type: string;
  period: string;
  channel_id: string;
  events_count: number;
}

export interface DiscordPostRecord {
  delivery_id: string;
  channel_id: string;
  message_id: string | null;
  events_count: number;
}

/**
 * The database operations that ingest, posting, summaries and achievements need.
 * Every "claim" is atomic: the caller owns only what the call returns.
 */
export interface ActivityStore {
  /** Insert events; a dedupe_key that is already stored is left untouched. */
  upsertEvents(events: NewEvent[]): Promise<void>;
  /** Flip posted_to_discord false to true for these dedupe keys; returns only the rows this call flipped. */
  claimEvents(dedupeKeys: string[]): Promise<ActivityEvent[]>;
  /** Events with posted_to_discord false that occurred within [from, to]. */
  findUnpostedEvents(from: string, to: string): Promise<ActivityEvent[]>;
  /** Insert the (summary_type, period) row; false when it already exists. */
  claimSummary(claim: SummaryClaim): Promise<boolean>;
  setSummaryMessageId(summaryType: string, period: string, messageId: string): Promise<void>;
  /** Insert the achievement unless (achievement_id, period) exists; null when it exists. */
  recordAchievement(achievement: NewAchievement): Promise<Achievement | null>;
  /** Events whose occurred_on falls within [fromDate, toDate] (YYYY-MM-DD). */
  eventsInRange(fromDate: string, toDate: string): Promise<ActivityEvent[]>;
  countEvents(): Promise<number>;
  /** Log one Discord post in discord_posts. */
  recordDiscordPost(post: DiscordPostRecord): Promise<void>;
}

// Postgres unique_violation
const UNIQUE_VIOLATION = "23505";

function fail(action: string, error: { message: string }): never {
  throw new Error(`Activity store: ${action} failed: ${error.message}`);
}

export function createSupabaseStore(): ActivityStore {
  const supabase = createAdminClient();

  return {
    async upsertEvents(events) {
      for (let i = 0; i < events.length; i += 100) {
        const { error } = await supabase
          .from("activity_events")
          .upsert(events.slice(i, i + 100), { onConflict: "dedupe_key", ignoreDuplicates: true });
        if (error) fail("upsert events", error);
      }
    },

    async claimEvents(dedupeKeys) {
      if (dedupeKeys.length === 0) return [];
      const { data, error } = await supabase
        .from("activity_events")
        .update({ posted_to_discord: true })
        .in("dedupe_key", dedupeKeys)
        .eq("posted_to_discord", false)
        .select("*");
      if (error) fail("claim events", error);
      return (data as ActivityEvent[]).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    },

    async findUnpostedEvents(from, to) {
      const { data, error } = await supabase
        .from("activity_events")
        .select("*")
        .eq("posted_to_discord", false)
        .gte("occurred_at", from)
        .lte("occurred_at", to)
        .order("occurred_at", { ascending: true });
      if (error) fail("find unposted events", error);
      return data as ActivityEvent[];
    },

    async claimSummary(claim) {
      const { error } = await supabase
        .from("summary_posts")
        .insert({ ...claim, posted_at: new Date().toISOString() });
      if (!error) return true;
      if (error.code === UNIQUE_VIOLATION) return false;
      return fail("claim summary", error);
    },

    async setSummaryMessageId(summaryType, period, messageId) {
      const { error } = await supabase
        .from("summary_posts")
        .update({ message_id: messageId })
        .eq("summary_type", summaryType)
        .eq("period", period);
      if (error) fail("set summary message id", error);
    },

    async recordAchievement(achievement) {
      const { data, error } = await supabase
        .from("achievements")
        .insert(achievement)
        .select()
        .single();
      if (!error) return data as Achievement;
      if (error.code === UNIQUE_VIOLATION) return null;
      return fail("record achievement", error);
    },

    async eventsInRange(fromDate, toDate) {
      const { data, error } = await supabase
        .from("activity_events")
        .select("*")
        .gte("occurred_on", fromDate)
        .lte("occurred_on", toDate)
        .order("occurred_at", { ascending: true });
      if (error) fail("read events", error);
      return data as ActivityEvent[];
    },

    async countEvents() {
      const { count, error } = await supabase
        .from("activity_events")
        .select("*", { count: "exact", head: true });
      if (error) fail("count events", error);
      return count ?? 0;
    },

    async recordDiscordPost(post) {
      const { error } = await supabase
        .from("discord_posts")
        .insert({ ...post, posted_at: new Date().toISOString() });
      if (error) fail("record discord post", error);
    },
  };
}
