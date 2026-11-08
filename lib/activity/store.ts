import { createAdminClient } from "@/lib/supabase/server";
import type { Achievement, ActivityEvent, DiscordRepo } from "@/lib/supabase/types";

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

export interface EventRepo {
  repo_full_name: string;
  has_private_event: boolean;
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
  /** Flip posted_to_discord false to true for every event that occurred within [from, to]; returns only the rows this call flipped. */
  claimUnhandledEvents(from: string, to: string): Promise<ActivityEvent[]>;
  /** Flip posted_to_discord back to false for these event ids, so a later claim picks them up again. */
  releaseEvents(ids: number[]): Promise<void>;
  /** The subset of these dedupe keys that are already stored. */
  findStoredKeys(dedupeKeys: string[]): Promise<string[]>;
  /** Set lines_added and lines_removed on the event with this dedupe key. */
  setEventLines(dedupeKey: string, linesAdded: number, linesRemoved: number): Promise<void>;
  /** Every distinct repo named by a stored GitHub event, with whether any of its events came from a private repo. */
  listEventRepos(): Promise<EventRepo[]>;
  /** Every saved discord_repos row. */
  listDiscordRepos(): Promise<DiscordRepo[]>;
  /** Insert or update discord_repos rows by repo_full_name. */
  saveDiscordRepos(repos: DiscordRepo[]): Promise<void>;
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

/** Upsert events and return how many rows were new. */
export async function insertNewEvents(store: ActivityStore, events: NewEvent[]): Promise<number> {
  const before = await store.countEvents();
  await store.upsertEvents(events);
  return (await store.countEvents()) - before;
}

// Postgres unique_violation
const UNIQUE_VIOLATION = "23505";

function fail(action: string, error: { message: string }): never {
  throw new Error(`Activity store: ${action} failed: ${error.message}`);
}

// Supabase caps a single response at 1000 rows, so page through a query.
async function selectAllPages<T>(
  action: string,
  query: (range: { from: number; to: number }) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query({ from, to: from + pageSize - 1 });
    if (error) fail(action, error);
    const page = data as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
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

    async claimUnhandledEvents(from, to) {
      const { data, error } = await supabase
        .from("activity_events")
        .update({ posted_to_discord: true })
        .eq("posted_to_discord", false)
        .gte("occurred_at", from)
        .lte("occurred_at", to)
        .select("*");
      if (error) fail("claim unhandled events", error);
      return (data as ActivityEvent[]).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    },

    async releaseEvents(ids) {
      if (ids.length === 0) return;
      const { error } = await supabase.from("activity_events").update({ posted_to_discord: false }).in("id", ids);
      if (error) fail("release events", error);
    },

    async findStoredKeys(dedupeKeys) {
      const stored: string[] = [];
      for (let i = 0; i < dedupeKeys.length; i += 100) {
        const { data, error } = await supabase
          .from("activity_events")
          .select("dedupe_key")
          .in("dedupe_key", dedupeKeys.slice(i, i + 100));
        if (error) fail("find stored keys", error);
        stored.push(...(data as { dedupe_key: string }[]).map((row) => row.dedupe_key));
      }
      return stored;
    },

    async setEventLines(dedupeKey, linesAdded, linesRemoved) {
      const { error } = await supabase
        .from("activity_events")
        .update({ lines_added: linesAdded, lines_removed: linesRemoved })
        .eq("dedupe_key", dedupeKey);
      if (error) fail("set event lines", error);
    },

    async listEventRepos() {
      const rows = await selectAllPages<{ repo: string | null; repo_visibility: string | null }>(
        "list event repos",
        (range) =>
          supabase
            .from("activity_events")
            .select("repo:metadata->>repo, repo_visibility")
            .eq("source", "github")
            .order("id", { ascending: true })
            .range(range.from, range.to),
      );
      const repos = new Map<string, boolean>();
      for (const row of rows) {
        if (!row.repo) continue;
        repos.set(row.repo, (repos.get(row.repo) ?? false) || row.repo_visibility === "private");
      }
      return [...repos].map(([repo_full_name, has_private_event]) => ({ repo_full_name, has_private_event }));
    },

    async listDiscordRepos() {
      const { data, error } = await supabase
        .from("discord_repos")
        .select("repo_full_name, display_name, included");
      if (error) fail("list discord repos", error);
      return data as DiscordRepo[];
    },

    async saveDiscordRepos(repos) {
      if (repos.length === 0) return;
      const updated_at = new Date().toISOString();
      const { error } = await supabase
        .from("discord_repos")
        .upsert(repos.map((repo) => ({ ...repo, updated_at })), { onConflict: "repo_full_name" });
      if (error) fail("save discord repos", error);
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
      return selectAllPages<ActivityEvent>("read events", (range) =>
        supabase
          .from("activity_events")
          .select("*")
          .gte("occurred_on", fromDate)
          .lte("occurred_on", toDate)
          .order("occurred_at", { ascending: true })
          .order("id", { ascending: true })
          .range(range.from, range.to),
      );
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
