import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent } from "@/lib/supabase/types";

const settings = vi.hoisted(() => ({ excluded_repos: [] as string[] }));
vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ github_username: "Staxed", github_org: "", timezone: "America/New_York", ...settings }),
}));
vi.mock("@/lib/quotes", () => ({ getRandomQuote: async () => null }));

import { buildGroupedEmbeds } from "./embeds";

function commit(repo: string, id: number): ActivityEvent {
  return {
    id,
    occurred_at: "2026-01-05T15:00:00Z",
    occurred_on: "2026-01-05",
    source: "github",
    category: "code",
    kind: "commit_pushed",
    value: 1,
    unit: "count",
    title: `secret work ${id}`,
    public_summary: null,
    visibility: "public",
    repo_visibility: "public",
    repo_hash: null,
    url: `https://github.com/${repo}/commit/${id}`,
    metadata: { repo },
    dedupe_key: null,
    created_at: "2026-01-05T15:00:00Z",
  } as ActivityEvent;
}

describe("buildGroupedEmbeds with an exclude list", () => {
  beforeEach(() => {
    settings.excluded_repos = ["Acme/hidden"];
  });

  const events = [commit("Acme/open", 1), commit("Acme/hidden", 2), commit("Acme/hidden", 3)];

  it("collapses excluded events into one redacted line and leaks no detail", async () => {
    const embeds = await buildGroupedEmbeds(events);
    const text = JSON.stringify(embeds);
    expect(text).toContain("Active in 1 redacted repos · 2 events");
    expect(text).toContain("secret work 1");
    expect(text).not.toContain("secret work 2");
    expect(text).not.toContain("secret work 3");
    expect(text).not.toContain("Acme/hidden");
  });

  it("still counts excluded events in the summary", async () => {
    const [summary] = await buildGroupedEmbeds(events);
    expect(summary.description).toContain("**3** events");
  });

  it("shows everything when the list is empty", async () => {
    settings.excluded_repos = [];
    const text = JSON.stringify(await buildGroupedEmbeds(events));
    expect(text).toContain("secret work 2");
    expect(text).not.toContain("redacted");
  });
});
