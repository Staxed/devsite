import { describe, expect, it, vi } from "vitest";

type Call = [string, ...unknown[]];
let calls: Call[];
let result: { data?: unknown; error?: { code?: string; message: string } | null };

vi.mock("@/lib/supabase/server", () => {
  const builder = (): unknown =>
    new Proxy(() => undefined, {
      get: (_t, prop: string) =>
        prop === "then"
          ? (resolve: (v: unknown) => void) => resolve({ data: null, error: null, ...result })
          : (...args: unknown[]) => {
              calls.push([prop, ...args]);
              return builder();
            },
    });
  return { createAdminClient: () => ({ from: () => builder() }) };
});

import { createSupabaseStore } from "./store";

describe("supabase store claims", () => {
  it("claims events with a conditional update on posted_to_discord=false", async () => {
    calls = [];
    result = { data: [{ occurred_at: "b" }, { occurred_at: "a" }] };
    const claimed = await createSupabaseStore().claimEvents(["k1", "k2"]);

    expect(calls).toContainEqual(["update", { posted_to_discord: true }]);
    expect(calls).toContainEqual(["eq", "posted_to_discord", false]);
    expect(claimed.map((e) => e.occurred_at)).toEqual(["a", "b"]);
  });

  it("claims a time range with a conditional update on posted_to_discord=false", async () => {
    calls = [];
    result = { data: [{ occurred_at: "b" }, { occurred_at: "a" }] };
    const claimed = await createSupabaseStore().claimUnhandledEvents("2026-03-10T10:00:00Z", "2026-03-10T11:00:00Z");

    expect(calls).toContainEqual(["update", { posted_to_discord: true }]);
    expect(calls).toContainEqual(["eq", "posted_to_discord", false]);
    expect(calls).toContainEqual(["gte", "occurred_at", "2026-03-10T10:00:00Z"]);
    expect(calls).toContainEqual(["lte", "occurred_at", "2026-03-10T11:00:00Z"]);
    expect(claimed.map((e) => e.occurred_at)).toEqual(["a", "b"]);
  });

  it("returns false from claimSummary on a unique violation and true on insert", async () => {
    const claim = { summary_type: "daily", period: "2026-03-10", channel_id: "c", events_count: 0 };
    calls = [];
    result = { error: { code: "23505", message: "dup" } };
    expect(await createSupabaseStore().claimSummary(claim)).toBe(false);
    result = { error: null };
    expect(await createSupabaseStore().claimSummary(claim)).toBe(true);
  });

  it("returns null from recordAchievement on a unique violation", async () => {
    result = { error: { code: "23505", message: "dup" } };
    expect(await createSupabaseStore().recordAchievement({ achievement_id: "a", period: "p" } as never)).toBeNull();
  });

  it("throws on other errors", async () => {
    result = { error: { code: "XX", message: "boom" } };
    await expect(createSupabaseStore().claimSummary({ summary_type: "daily", period: "p", channel_id: "c", events_count: 0 })).rejects.toThrow("boom");
  });

  it("pages eventsInRange past 1000 rows", async () => {
    calls = [];
    const pages = [Array.from({ length: 1000 }, (_, i) => ({ id: i })), [{ id: 1000 }]];
    const store = createSupabaseStore();
    // each awaited page takes the next entry
    result = { get data() { return pages.shift(); } } as typeof result;
    const rows = await store.eventsInRange("2026-01-01", "2026-03-10");
    expect(rows).toHaveLength(1001);
  });
});

describe("supabase store discord/line methods", () => {
  it("releases events by id and sends nothing for an empty list", async () => {
    calls = [];
    result = {};
    await createSupabaseStore().releaseEvents([]);
    expect(calls).toEqual([]);
    await createSupabaseStore().releaseEvents([1, 2]);
    expect(calls).toContainEqual(["update", { posted_to_discord: false }]);
    expect(calls).toContainEqual(["in", "id", [1, 2]]);
  });

  it("looks up stored keys in chunks of 100 and joins the results", async () => {
    calls = [];
    result = { data: [{ dedupe_key: "k" }] };
    const keys = Array.from({ length: 250 }, (_, i) => `k${i}`);
    const stored = await createSupabaseStore().findStoredKeys(keys);
    const ins = calls.filter((c) => c[0] === "in");
    expect(ins.map((c) => (c[2] as string[]).length)).toEqual([100, 100, 50]);
    expect((ins[2][2] as string[])[0]).toBe("k200");
    expect(stored).toEqual(["k", "k", "k"]);
  });

  it("sets line counts only on the event with that dedupe key", async () => {
    calls = [];
    result = {};
    await createSupabaseStore().setEventLines("key-1", 5, 2);
    expect(calls).toContainEqual(["update", { lines_added: 5, lines_removed: 2 }]);
    expect(calls).toContainEqual(["eq", "dedupe_key", "key-1"]);
  });

  it("upserts discord repos on repo_full_name with updated_at", async () => {
    calls = [];
    result = {};
    await createSupabaseStore().saveDiscordRepos([{ repo_full_name: "o/r", display_name: "R", included: true }]);
    const upsert = calls.find((c) => c[0] === "upsert");
    expect(upsert?.[1]).toEqual([
      expect.objectContaining({ repo_full_name: "o/r", display_name: "R", included: true, updated_at: expect.any(String) }),
    ]);
    expect(upsert?.[2]).toEqual({ onConflict: "repo_full_name" });
  });
});
