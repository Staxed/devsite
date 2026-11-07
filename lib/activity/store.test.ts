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
