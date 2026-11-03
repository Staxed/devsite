import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/activity/memory-store";
import type { NewEvent } from "@/lib/activity/store";

vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ github_username: "Staxed", github_org: "", timezone: "America/New_York", excluded_repos: [] }),
}));
// The replay must never reach Discord; any fetch fails the test.
const fetchSpy = vi.fn(async () => {
  throw new Error("replay must not call fetch");
});

import { replayAchievements, checkAchievements } from "./engine";

let sequence = 0;
// Noon New York (17:00 UTC in winter) on the given day
const commit = (day: string, title = "work"): NewEvent => ({
  occurred_at: `${day}T17:00:00Z`, occurred_on: day, source: "github", category: "code", kind: "commit_pushed",
  value: 1, unit: "count", title, public_summary: null, visibility: "public", repo_visibility: "public",
  repo_hash: "h", url: null, metadata: {}, dedupe_key: `commit:r:${sequence++}`, posted_to_discord: true,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-10T15:00:00Z"));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("achievement replay", () => {
  it("records streak, week and month achievements with their historical periods and sends nothing", async () => {
    const store = createMemoryStore();
    const streakDays = Array.from({ length: 8 }, (_, i) => `2026-01-${String(5 + i).padStart(2, "0")}`);
    const busyDay = Array.from({ length: 25 }, () => commit("2026-02-04")); // Wednesday of the week starting 2026-02-02
    await store.upsertEvents([...streakDays.map((d) => commit(d)), ...busyDay]);

    const recorded = await replayAchievements(store, "2025-03-10", "2026-03-10");

    const byId = (id: string) => store.achievements.filter((a) => a.achievement_id === id);
    expect(byId("fire_starter")).toMatchObject([{ period: "all-time", earned_at: "2026-01-11T17:00:00Z" }]);
    expect(byId("productive_week")).toMatchObject([{ period: "2026-02-02", earned_at: "2026-02-04T17:00:00Z" }]);
    expect(byId("daily_dozen")).toMatchObject([{ period: "2026-02-04" }]);
    expect(recorded).toBe(store.achievements.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is not repeated by the next live check", async () => {
    const store = createMemoryStore();
    await store.upsertEvents(Array.from({ length: 101 }, () => commit("2026-03-10")));
    await replayAchievements(store, "2026-03-10", "2026-03-10");

    const live = await checkAchievements(store, store.events);

    expect(live).toEqual([]);
  });

  it("replays only the requested window while counting earlier history", async () => {
    const store = createMemoryStore();
    await store.upsertEvents([...Array.from({ length: 99 }, () => commit("2025-06-02")), commit("2026-02-02")]);

    await replayAchievements(store, "2026-01-01", "2026-03-10");

    expect(store.achievements.map((a) => a.achievement_id)).toContain("century_club");
    expect(store.achievements.find((a) => a.achievement_id === "century_club")!.earned_at).toBe("2026-02-02T17:00:00Z");
  });
});
