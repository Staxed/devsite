import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./memory-store";
import type { NewEvent } from "./store";

const event = (dedupe_key: string, occurred_at: string): NewEvent => ({
  occurred_at,
  occurred_on: occurred_at.slice(0, 10),
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
  metadata: {},
  dedupe_key,
});

const RANGE: [string, string] = ["2026-03-10T10:00:00Z", "2026-03-10T11:00:00Z"];

async function seeded() {
  const store = createMemoryStore();
  await store.upsertEvents([
    event("in-1", "2026-03-10T10:15:00Z"),
    event("in-2", "2026-03-10T10:45:00Z"),
    event("out", "2026-03-10T12:00:00Z"),
  ]);
  return store;
}

describe("claimUnhandledEvents", () => {
  it("flips posted_to_discord once for events in the range, and a second claim gets nothing", async () => {
    const store = await seeded();
    const first = await store.claimUnhandledEvents(...RANGE);
    expect(first.map((e) => e.dedupe_key)).toEqual(["in-1", "in-2"]);
    expect(await store.claimUnhandledEvents(...RANGE)).toEqual([]);
    expect((await store.claimUnhandledEvents("2026-03-10T11:30:00Z", "2026-03-10T12:30:00Z")).map((e) => e.dedupe_key)).toEqual(["out"]);
  });

  it("makes released events claimable again", async () => {
    const store = await seeded();
    const claimed = await store.claimUnhandledEvents(...RANGE);
    await store.releaseEvents(claimed.map((e) => e.id));
    expect((await store.claimUnhandledEvents(...RANGE)).map((e) => e.dedupe_key)).toEqual(["in-1", "in-2"]);
  });
});

describe("findStoredKeys", () => {
  it("reports only the keys already stored", async () => {
    const store = await seeded();
    expect(await store.findStoredKeys(["in-1", "new", "out"])).toEqual(["in-1", "out"]);
  });
});

describe("setEventLines", () => {
  it("writes line counts onto the event with that key", async () => {
    const store = await seeded();
    await store.setEventLines("in-2", 12, 3);
    const rows = await store.claimUnhandledEvents(...RANGE);
    expect(rows.map((e) => [e.lines_added ?? null, e.lines_removed ?? null])).toEqual([[null, null], [12, 3]]);
  });
});

describe("discord_repos", () => {
  it("saves new rows, updates existing ones and reads them back", async () => {
    const store = createMemoryStore();
    expect(await store.listDiscordRepos()).toEqual([]);
    await store.saveDiscordRepos([{ repo_full_name: "Staxed/site", display_name: null, included: false }]);
    await store.saveDiscordRepos([
      { repo_full_name: "Staxed/site", display_name: "Site", included: true },
      { repo_full_name: "Staxed/secret", display_name: "Project X", included: true },
    ]);
    expect(await store.listDiscordRepos()).toEqual([
      { repo_full_name: "Staxed/site", display_name: "Site", included: true },
      { repo_full_name: "Staxed/secret", display_name: "Project X", included: true },
    ]);
  });
});

describe("listEventRepos", () => {
  it("lists each GitHub repo once and flags those with a private event", async () => {
    const store = createMemoryStore();
    const e = (key: string, repo: string, repo_visibility: "public" | "private", source: "github" | "manual" = "github") => ({
      ...event(key, "2026-03-10T10:00:00Z"),
      source,
      repo_visibility,
      metadata: { repo },
    });
    await store.upsertEvents([
      e("1", "o/a", "public"),
      e("2", "o/a", "private"),
      e("3", "o/b", "public"),
      e("4", "o/manual", "public", "manual"),
    ]);
    expect(await store.listEventRepos()).toEqual([
      { repo_full_name: "o/a", has_private_event: true },
      { repo_full_name: "o/b", has_private_event: false },
    ]);
  });
});
