import { beforeEach, describe, expect, it, vi } from "vitest";

const replay = vi.fn();
const updates: unknown[] = [];

vi.mock("@/lib/auth/admin", () => ({ verifyAdmin: async () => ({ id: "admin" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({ update: (v: unknown) => { updates.push(v); return { eq: async () => ({}) }; } }),
  }),
}));
vi.mock("@/lib/github/backfill", () => ({ discoverRepos: vi.fn(), backfillRepoCommits: vi.fn(), backfillPRs: vi.fn() }));
vi.mock("@/lib/activity/store", () => ({ createSupabaseStore: () => ({}) }));
vi.mock("@/lib/achievements/engine", () => ({ replayAchievements: (...a: unknown[]) => replay(...a) }));
vi.mock("@/lib/settings", () => ({ getSettings: async () => ({ timezone: "America/New_York" }) }));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://x/api/admin/backfill", { method: "POST", body: JSON.stringify(body) }) as never);

beforeEach(() => {
  replay.mockReset().mockResolvedValue(3);
  updates.length = 0;
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
    expect(replay).toHaveBeenCalledWith({}, "2024-03-10", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(updates).toMatchObject([{ status: "completed" }]);
  });
});
