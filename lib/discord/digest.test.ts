import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/activity/memory-store";
import type { NewEvent } from "@/lib/activity/store";

vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ github_username: "Staxed", github_org: "", timezone: "America/New_York", excluded_repos: [] }),
}));

import { formatRepoCounts, postHourlyDigest } from "./digest";

const NOW = new Date("2026-03-10T15:30:00Z");
const IN_HOUR = "2026-03-10T14:20:00Z";
const TITLE = "Activity · Tue Mar 10, 10:00 AM – 10:59 AM EDT";

let discordMessages: { embeds: { title?: string; description?: string }[] }[];
let discordStatus: number;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.DISCORD_BOT_TOKEN = "bot";
  discordMessages = [];
  discordStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (discordStatus !== 200) return new Response("nope", { status: discordStatus });
      discordMessages.push(JSON.parse(String(init?.body)));
      return Response.json({ id: `msg-${discordMessages.length}` });
    })
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let seq = 0;
const event = (repo: string, overrides: Partial<NewEvent> = {}): NewEvent => ({
  occurred_at: IN_HOUR, occurred_on: IN_HOUR.slice(0, 10), source: "github", category: "code",
  kind: "commit_pushed", value: 1, unit: "count", title: "Secret commit message", public_summary: null,
  visibility: "public", repo_visibility: "public", repo_hash: "h", url: null,
  metadata: { repo }, dedupe_key: `k${seq++}`, ...overrides,
});

const included = (repo: string, display_name: string | null = null) => ({ repo_full_name: repo, display_name, included: true });

async function setup(events: NewEvent[], repos = [included("Staxed/site", "Site")]) {
  const store = createMemoryStore();
  await store.upsertEvents(events);
  await store.saveDiscordRepos(repos);
  return store;
}
const descriptions = () => discordMessages.flatMap((m) => m.embeds.map((e) => e.description ?? ""));

describe("postHourlyDigest", () => {
  it("sends one embed with a line per included repo, busiest first, under the exact title", async () => {
    const store = await setup(
      [event("Staxed/a"), event("Staxed/b"), event("Staxed/b"), event("Staxed/b", { kind: "pr_merged" })],
      [included("Staxed/a", "Alpha"), included("Staxed/b", "Beta")]
    );
    await postHourlyDigest(store, "chan", NOW);

    expect(discordMessages).toHaveLength(1);
    expect(discordMessages[0].embeds).toHaveLength(1);
    expect(discordMessages[0].embeds[0].title).toBe(TITLE);
    const lines = discordMessages[0].embeds[0].description!.split("\n");
    expect(lines).toEqual([
      "**[Beta](https://github.com/Staxed/b)**: 2 commits · 1 PR merged",
      "**[Alpha](https://github.com/Staxed/a)**: 1 commit",
    ]);
    expect(store.discordPosts).toHaveLength(1);
  });

  it("sends nothing for an empty hour", async () => {
    await postHourlyDigest(await setup([]), "chan", NOW);
    expect(discordMessages).toEqual([]);
  });

  it("sends nothing but marks handled when only off-list repos or uncounted kinds have events", async () => {
    const store = await setup([
      event("Other/repo"),
      event("Staxed/site", { kind: "repo_starred" }),
      event("Staxed/site", { source: "manual" }),
    ]);
    await postHourlyDigest(store, "chan", NOW);

    expect(discordMessages).toEqual([]);
    expect(store.events.every((e) => e.posted_to_discord)).toBe(true);
  });

  it("shows a private repo by its display name only", async () => {
    const store = await setup([event("Staxed/secret", { repo_visibility: "private", visibility: "private", url: "https://github.com/Staxed/secret/commit/1" })], [
      included("Staxed/secret", "Project X"),
    ]);
    await postHourlyDigest(store, "chan", NOW);

    const text = JSON.stringify(discordMessages);
    expect(descriptions()).toEqual(["**Project X**: 1 commit"]);
    for (const leaked of ["Staxed/secret", "secret", "Secret commit message", "github.com"]) expect(text).not.toContain(leaked);
  });

  it("links a public repo and uses its short name when the display name is empty", async () => {
    await postHourlyDigest(await setup([event("Staxed/site")], [included("Staxed/site")]), "chan", NOW);
    expect(descriptions()).toEqual(["**[site](https://github.com/Staxed/site)**: 1 commit"]);
  });

  it("does not link a repo with mixed visibility", async () => {
    await postHourlyDigest(await setup([event("Staxed/site"), event("Staxed/site", { repo_visibility: "private" })]), "chan", NOW);
    expect(descriptions()).toEqual(["**Site**: 2 commits"]);
  });

  it("shows a nameless repo with private activity as Private repo", async () => {
    const store = await setup([event("Staxed/site", { repo_visibility: "private" })], [included("Staxed/site")]);
    await postHourlyDigest(store, "chan", NOW);
    expect(descriptions()).toEqual(["**Private repo**: 1 commit"]);
  });

  it("leaves a current-hour event for the next digest", async () => {
    const store = await setup([event("Staxed/site", { occurred_at: "2026-03-10T15:10:00Z" })]);
    await postHourlyDigest(store, "chan", NOW);
    expect(discordMessages).toEqual([]);

    await postHourlyDigest(store, "chan", new Date("2026-03-10T16:05:00Z"));
    expect(discordMessages[0].embeds[0].title).toBe("Activity · Tue Mar 10, 11:00 AM – 11:59 AM EDT");
    expect(descriptions()).toHaveLength(1);
  });

  it("shows a late event in the next digest", async () => {
    const store = await setup([event("Staxed/site")]);
    await postHourlyDigest(store, "chan", NOW);
    await store.upsertEvents([event("Staxed/site", { occurred_at: "2026-03-10T14:50:00Z" })]);
    await postHourlyDigest(store, "chan", new Date("2026-03-10T16:05:00Z"));

    expect(descriptions()).toEqual([expect.stringContaining("1 commit"), expect.stringContaining("1 commit")]);
  });

  it("marks events older than 24 hours handled without posting", async () => {
    const store = await setup([event("Staxed/site", { occurred_at: "2026-03-09T10:00:00Z", occurred_on: "2026-03-09" })]);
    await postHourlyDigest(store, "chan", NOW);
    expect(discordMessages).toEqual([]);
    expect(store.events[0].posted_to_discord).toBe(true);
  });

  it("posts once when run twice", async () => {
    const store = await setup([event("Staxed/site")]);
    await postHourlyDigest(store, "chan", NOW);
    await postHourlyDigest(store, "chan", NOW);
    expect(descriptions()).toHaveLength(1);
  });

  it("leaves events for the next digest when the send fails", async () => {
    const store = await setup([event("Staxed/site")]);
    discordStatus = 500;
    await postHourlyDigest(store, "chan", NOW);
    expect(store.events[0].posted_to_discord).toBe(false);
    expect(store.discordPosts).toEqual([]);

    discordStatus = 200;
    await postHourlyDigest(store, "chan", new Date("2026-03-10T16:05:00Z"));
    expect(descriptions()).toHaveLength(1);
  });

  describe("achievements", () => {
    const longCommit = () => event("Staxed/site", { title: "x".repeat(101) });
    const achievementMessages = () => discordMessages.filter((m) => JSON.stringify(m).includes("Achievement Unlocked"));

    it("posts after the digest", async () => {
      await postHourlyDigest(await setup([longCommit()]), "chan", NOW);
      expect(discordMessages[0].embeds[0].title).toBe(TITLE);
      expect(achievementMessages().length).toBeGreaterThan(0);
      expect(discordMessages.indexOf(achievementMessages()[0])).toBeGreaterThan(0);
    });

    it("does not post when the send fails", async () => {
      const store = await setup([longCommit()]);
      discordStatus = 500;
      await postHourlyDigest(store, "chan", NOW);
      expect(store.achievements).toEqual([]);
    });
  });
});

describe("formatRepoCounts", () => {
  const ev = (kind: string, lines?: [number, number]) =>
    ({ ...event("Staxed/site", { kind }), lines_added: lines?.[0] ?? null, lines_removed: lines?.[1] ?? null }) as never;

  it("shows counts above zero with singulars and the lines part", () => {
    const events = [ev("commit_pushed", [100, 4]), ev("commit_pushed", [20, 30]), ev("pr_merged"), ev("issue_comment_created"), ev("pr_comment_created")];
    expect(formatRepoCounts(events)).toBe("2 commits · 1 PR merged · 2 comments · +120 / −34 lines");
  });

  it("omits the lines part when both sums are zero and skips empty values", () => {
    expect(formatRepoCounts([ev("commit_pushed"), ev("tag_created")])).toBe("1 commit · 1 tag created");
  });
});
