import { describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/activity/memory-store";
import type { DiscoveredRepo } from "@/lib/github/backfill";
import type { NewEvent } from "@/lib/activity/store";
import { buildRepoList } from "./repo-list";

const repo = (full_name: string, archived = false): DiscoveredRepo => ({
  id: full_name.length,
  full_name,
  owner: full_name.split("/")[0],
  name: full_name.split("/")[1],
  visibility: "public",
  archived,
});

const commitIn = (full_name: string): NewEvent => ({
  occurred_at: "2026-03-10T10:00:00Z",
  occurred_on: "2026-03-10",
  source: "github",
  category: "code",
  kind: "commit_pushed",
  value: 1,
  unit: "count",
  title: null,
  public_summary: null,
  visibility: "public",
  repo_visibility: "public",
  repo_hash: null,
  url: null,
  metadata: { repo: full_name },
  dedupe_key: full_name,
});

describe("buildRepoList", () => {
  it("leaves out repos GitHub reports as archived, even with stored events or a saved row, and keeps that data", async () => {
    const store = createMemoryStore();
    await store.upsertEvents([commitIn("o/old"), commitIn("o/live")]);
    await store.saveDiscordRepos([{ repo_full_name: "o/old", display_name: "Old", included: true }]);

    const list = await buildRepoList(store, [repo("o/old", true), repo("o/live"), repo("o/also-archived", true)]);

    expect(list.map((r) => r.repo_full_name)).toEqual(["o/live"]);
    expect(await store.listDiscordRepos()).toEqual([{ repo_full_name: "o/old", display_name: "Old", included: true }]);
    expect((await store.listEventRepos()).map((r) => r.repo_full_name)).toContain("o/old");
  });
});
