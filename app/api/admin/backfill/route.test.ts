import { beforeEach, describe, expect, it, vi } from "vitest";

const replay = vi.fn();
const updates: unknown[] = [];
const discoverRepos = vi.fn();
const backfillPRs = vi.fn();
const listDiscordRepos = vi.fn();
let tables: Record<string, unknown[]> = {};

vi.mock("@/lib/auth/admin", () => ({ verifyAdmin: async () => ({ id: "admin" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      update: (v: unknown) => { updates.push(v); return { eq: async () => ({}) }; },
      upsert: async () => ({}),
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: "run1" } }) }) }),
      select: () => {
        const result = { data: tables[table] ?? [] };
        return { eq: async () => result, then: (f: (v: unknown) => unknown) => Promise.resolve(result).then(f) };
      },
    }),
  }),
}));
vi.mock("@/lib/github/backfill", () => ({
  discoverRepos: (...a: unknown[]) => discoverRepos(...a),
  backfillRepoCommits: vi.fn(),
  backfillPRs: (...a: unknown[]) => backfillPRs(...a),
}));
vi.mock("@/lib/activity/store", () => ({ createSupabaseStore: () => ({ listDiscordRepos: () => listDiscordRepos() }) }));
vi.mock("@/lib/achievements/engine", () => ({ replayAchievements: (...a: unknown[]) => replay(...a) }));
vi.mock("@/lib/settings", () => ({ getSettings: async () => ({ timezone: "America/New_York" }) }));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://x/api/admin/backfill", { method: "POST", body: JSON.stringify(body) }) as never);

beforeEach(() => {
  replay.mockReset().mockResolvedValue(3);
  updates.length = 0;
  tables = {};
  discoverRepos.mockReset();
  backfillPRs.mockReset().mockResolvedValue(2);
  listDiscordRepos.mockReset().mockResolvedValue([]);
});

describe("finalize", () => {
  it("rejects a missing since", async () => {
    const res = await post({ action: "finalize", run_id: "r1" });
    expect(res.status).toBe(400);
    expect(replay).not.toHaveBeenCalled();
  });

  it("replays from the since date to today and reports the achievements", async () => {
    const res = await post({ action: "finalize", run_id: "r1", since: "2024-03-10T15:00:00.000Z" });

    expect(await res.json()).toEqual({ ok: true, achievements: 3 });
    expect(replay).toHaveBeenCalledWith(expect.anything(), "2024-03-10", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(updates).toMatchObject([{ status: "completed" }]);
  });
});

describe("discover", () => {
  const repo = (id: number, full: string, archived = false) => ({
    id, full_name: full, owner: full.split("/")[0], name: full.split("/")[1], visibility: "public", archived,
  });

  it("adds included, is_new and backfilled_at, and drops archived repos", async () => {
    discoverRepos.mockResolvedValue([repo(1, "A/one"), repo(2, "A/two"), repo(3, "A/old", true)]);
    tables = {
      tracked_repos: [{ provider_repo_id: "1" }],
      sync_state: [{ scope: "1", last_synced_at: "2026-03-01T00:00:00Z" }],
    };
    listDiscordRepos.mockResolvedValue([{ repo_full_name: "A/one", included: true, display_name: null }]);

    const body = await (await post({ action: "discover" })).json();

    expect(body.run).toEqual({ id: "run1" });
    expect(body.repos.map((r: { full_name: string }) => r.full_name)).toEqual(["A/one", "A/two"]);
    expect(body.repos[0]).toMatchObject({ included: true, is_new: false, backfilled_at: "2026-03-01T00:00:00Z" });
    expect(body.repos[1]).toMatchObject({ included: false, is_new: true, backfilled_at: null });
  });
});

describe("backfill_prs", () => {
  it("passes only the included repo names", async () => {
    listDiscordRepos.mockResolvedValue([
      { repo_full_name: "A/one", included: true, display_name: null },
      { repo_full_name: "A/two", included: false, display_name: null },
    ]);

    const body = await (await post({ action: "backfill_prs", since: "2024-03-10T00:00:00.000Z" })).json();

    expect(body).toEqual({ inserted: 2 });
    expect(backfillPRs).toHaveBeenCalledWith("2024-03-10T00:00:00.000Z", undefined, new Set(["A/one"]));
  });
});
