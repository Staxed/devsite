import { describe, expect, it, vi } from "vitest";
import type { ActivityEvent } from "@/lib/supabase/types";

const state = vi.hoisted(() => ({ events: [] as unknown[] }));
vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ github_username: "Staxed", github_org: "", timezone: "America/New_York", excluded_repos: ["Acme/hidden"] }),
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/streaks/engine", () => ({
  getPeriodStats: vi.fn(), getLongestStreak: vi.fn(), getAllStreaks: vi.fn(), getTimePatterns: vi.fn(),
  getGithubEventsInRange: async () => state.events,
}));
vi.mock("./embeds", () => ({ buildStatsEmbed: vi.fn(), buildStreakEmbed: vi.fn(), EMBED_COLORS: { STATS: 1 }, KIND_EMOJI: {} }));

import { handleActivityRepos } from "./handlers";

function ev(repo: string, visibility: string, id: number) {
  return { id, occurred_at: "2026-01-05T15:00:00Z", occurred_on: "2026-01-05", kind: "commit_pushed", title: "t", visibility, url: null, metadata: { repo } } as unknown as ActivityEvent;
}

describe("handleActivityRepos", () => {
  it("lumps excluded repos into one row and keeps private repo names", async () => {
    state.events = [ev("Acme/open", "public", 1), ev("Acme/priv", "private", 2), ev("Acme/hidden", "public", 3), ev("Acme/hidden", "public", 4)];
    const { embeds } = await handleActivityRepos([]);
    const fields = embeds[0].fields!;
    expect(fields.find((f) => f.name === "Redacted repos")?.value).toBe("2 events");
    expect(fields.map((f) => f.name)).toContain("Acme/priv");
    expect(JSON.stringify(fields)).not.toContain("Acme/hidden");
  });
});
