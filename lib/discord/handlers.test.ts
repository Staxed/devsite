import { describe, expect, it, vi } from "vitest";
import type { ActivityEvent } from "@/lib/supabase/types";

const state = vi.hoisted(() => ({ events: [] as unknown[], repos: [] as unknown[] }));
vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ github_username: "Staxed", github_org: "", timezone: "America/New_York", excluded_repos: ["Acme/hidden"] }),
}));
vi.mock("@/lib/activity/store", () => ({ createSupabaseStore: () => ({ listDiscordRepos: async () => state.repos }) }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/streaks/engine", () => ({
  getPeriodStats: vi.fn(), getLongestStreak: vi.fn(), getAllStreaks: vi.fn(), getTimePatterns: vi.fn(),
  getGithubEventsInRange: async () => state.events,
}));
vi.mock("./embeds", () => ({ buildStatsEmbed: vi.fn(), buildStreakEmbed: vi.fn(), EMBED_COLORS: { STATS: 1 }, KIND_EMOJI: {} }));

import { handleActivityRepos, scaledBar } from "./handlers";

function ev(repo: string, visibility: "public" | "private", id: number) {
  return { id, occurred_at: "2026-01-05T15:00:00Z", occurred_on: "2026-01-05", kind: "commit_pushed", title: "t", repo_visibility: visibility, url: null, metadata: { repo } } as unknown as ActivityEvent;
}

describe("handleActivityRepos", () => {
  it("lists only included repos under display names, never a private repo's real name", async () => {
    state.repos = [
      { repo_full_name: "Acme/open", display_name: null, included: true },
      { repo_full_name: "Acme/secret", display_name: "Side project", included: true },
      { repo_full_name: "Acme/unnamed", display_name: null, included: true },
      { repo_full_name: "Acme/off", display_name: "Off", included: false },
    ];
    state.events = [ev("Acme/open", "public", 1), ev("Acme/secret", "private", 2), ev("Acme/secret", "private", 3), ev("Acme/unnamed", "private", 4), ev("Acme/off", "public", 5), ev("Acme/other", "public", 6)];
    const { embeds } = await handleActivityRepos([]);
    const fields = embeds[0].fields!;
    expect(fields.map((f) => f.name)).toEqual(["Side project", "open", "Private repo"]);
    expect(fields[0].value).toBe("2 events");
    const text = JSON.stringify(fields);
    for (const hidden of ["Acme/secret", "secret", "Acme/unnamed", "Acme/off", "Off", "Redacted", "Acme/other"]) expect(text).not.toContain(hidden);
  });
});

describe("scaledBar", () => {
  it("scales bars to the largest count, so bigger counts get longer bars", () => {
    expect(scaledBar(178, 178)).toHaveLength(15);
    expect(scaledBar(35, 178)).toHaveLength(3);
    expect(scaledBar(14, 178)).toHaveLength(1);
    expect(scaledBar(0, 178)).toBe("");
  });
});
