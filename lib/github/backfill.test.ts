import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/activity/memory-store";

vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ github_username: "Staxed", github_org: "", timezone: "America/New_York", excluded_repos: ["Acme/hidden"] }),
}));
vi.mock("@/lib/quotes", () => ({ getRandomQuote: async () => null }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }));

import { discoverRepos, backfillRepoCommits, backfillPRs } from "./backfill";
import { twoYearsBefore } from "@/lib/dates";
import { postHourlyDigest } from "@/lib/discord/digest";

const NOW = new Date("2026-03-10T15:00:00Z");
const COMMIT_TIME = "2026-03-09T14:00:00Z";

let requests: URL[];
let discordMessages: unknown[];
// total_count answered for a PR search window, keyed by its created: range; page results by the same key
let prSearch: Record<string, { total: number; items: unknown[] }>;

const repoJson = (full: string, priv: boolean) => ({ id: full.length, full_name: full, name: full.split("/")[1], private: priv, owner: { login: full.split("/")[0] } });
const prItem = (n: number, repo: string, state = "open") => ({
  number: n, title: `PR ${n}`, state, html_url: `https://github.com/${repo}/pull/${n}`, repository_url: `https://api.github.com/repos/${repo}`,
  created_at: COMMIT_TIME, updated_at: COMMIT_TIME, pull_request: {},
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.GITHUB_EVENTS_TOKEN = "pat";
  process.env.DISCORD_CHANNEL_ID = "chan";
  process.env.DISCORD_BOT_TOKEN = "bot";
  requests = [];
  discordMessages = [];
  prSearch = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      requests.push(url);
      if (url.host === "discord.com") {
        discordMessages.push(JSON.parse(String(init?.body)));
        return Response.json({ id: "m" });
      }
      if (url.pathname === "/user/repos") {
        return Response.json(url.searchParams.get("page") === "1" || !url.searchParams.get("page") ? [repoJson("Staxed/site", false), repoJson("Acme/hidden", true)] : []);
      }
      if (url.pathname === "/repos/Staxed/site/commits" || url.pathname === "/repos/Acme/hidden/commits") {
        return Response.json(url.searchParams.get("page") === "1" || !url.searchParams.get("page")
          ? [{ sha: "abc", html_url: "https://github.com/x/commit/abc", commit: { message: "Add feature\n\nbody", author: { date: COMMIT_TIME } } }]
          : []);
      }
      if (url.pathname === "/search/issues") {
        const window = /created:(\S+)/.exec(url.searchParams.get("q")!)![1];
        const found = prSearch[window];
        if (!found) throw new Error(`Unexpected PR search window ${window}`);
        const page = url.searchParams.get("page");
        // octokit spaces search calls 2s apart by Date.now(), which is frozen here: step the clock past it
        vi.setSystemTime(Date.now() + 5000);
        const res = Response.json({ total_count: found.total, incomplete_results: false, items: !page || page === "1" ? found.items : [] });
        // octokit's paginate reads response.url for search results; a bare Response has none
        Object.defineProperty(res, "url", { value: String(url) });
        return res;
      }
      if (url.pathname === "/users/Staxed/events") {
        return Response.json(url.searchParams.get("page") === "1" ? [{
          id: "1", type: "PushEvent", actor: { login: "Staxed" }, repo: { name: "Staxed/site" }, public: true, created_at: COMMIT_TIME,
          payload: { before: "b0", head: "abc" },
        }] : []);
      }
      if (url.pathname === "/repos/Staxed/site/compare/b0...abc") {
        return Response.json({ commits: [{ sha: "abc", commit: { message: "Add feature", author: { name: "Staxed", email: "staxed@users.noreply.github.com" } }, author: { login: "Staxed" } }] });
      }
      throw new Error(`Unexpected fetch ${url}`);
    })
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("backfill", () => {
  it("lists repos by owner, collaborator and organization membership", async () => {
    const repos = await discoverRepos();

    expect(repos.map((r) => r.full_name)).toEqual(["Staxed/site", "Acme/hidden"]);
    const listing = requests.find((u) => u.pathname === "/user/repos")!;
    expect(listing.searchParams.get("affiliation")).toBe("owner,collaborator,organization_member");
  });

  it("stores commits as already posted, and the hourly digest never posts them", async () => {
    const store = createMemoryStore();
    const [site] = await discoverRepos();

    const inserted = await backfillRepoCommits(site, "2024-03-10T15:00:00.000Z", store);
    await store.saveDiscordRepos([{ repo_full_name: "Staxed/site", display_name: "Site", included: true }]);
    const lines = await postHourlyDigest(store, "chan", new Date("2026-03-10T15:30:00Z"));

    expect(lines).toBe(0);
    expect(inserted).toBe(1);
    expect(store.events).toMatchObject([{ dedupe_key: "commit:Staxed/site:abc", posted_to_discord: true, title: "Add feature" }]);
    expect(discordMessages).toEqual([]);
  });

  it("stores excluded and private repos' commits like any other", async () => {
    const store = createMemoryStore();
    await backfillRepoCommits({ id: 1, full_name: "Staxed/site", owner: "Staxed", name: "site", visibility: "private" }, "2024-03-10T15:00:00.000Z", store);

    expect(store.events).toMatchObject([{ repo_visibility: "private", visibility: "private", url: null, posted_to_discord: true }]);
  });

  it("stores commits of an excluded repo and counts them", async () => {
    const store = createMemoryStore();
    const inserted = await backfillRepoCommits({ id: 2, full_name: "Acme/hidden", owner: "Acme", name: "hidden", visibility: "public" }, "2024-03-10T15:00:00.000Z", store);

    expect(inserted).toBe(1);
    expect(store.events).toMatchObject([{ dedupe_key: "commit:Acme/hidden:abc", metadata: { repo: "Acme/hidden" }, posted_to_discord: true }]);
  });

  it("fails loudly when a single day still has over 1000 PRs", async () => {
    const store = createMemoryStore();
    prSearch["2026-03-10..2026-03-10"] = { total: 1500, items: [] };

    await expect(backfillPRs("2026-03-10T00:00:00.000Z", store)).rejects.toThrow(/cannot be split/);
  });

  it("splits the PR search into date windows under the 1000-result cap and stores the PRs as posted", async () => {
    const store = createMemoryStore();
    prSearch["2024-03-10..2026-03-10"] = { total: 1500, items: [] };
    prSearch["2024-03-10..2025-03-10"] = { total: 600, items: [prItem(1, "Staxed/site")] };
    prSearch["2025-03-11..2026-03-10"] = { total: 900, items: [prItem(2, "Acme/hidden", "closed")] };

    const inserted = await backfillPRs("2024-03-10T15:00:00.000Z", store);

    expect(inserted).toBe(2);
    expect(store.events.map((e) => [e.dedupe_key, e.posted_to_discord])).toEqual([
      ["pr:Staxed/site:1:pr_opened", true],
      ["pr:Acme/hidden:2:pr_closed", true],
    ]);
    expect(discordMessages).toEqual([]);

    // Same search again, limited to one repo: the other repo's PR is skipped (the clock is shared, so it stays in this test)
    const limited = createMemoryStore();
    expect(await backfillPRs("2024-03-10T15:00:00.000Z", limited, new Set(["Staxed/site"]))).toBe(1);
    expect(limited.events.map((e) => e.dedupe_key)).toEqual(["pr:Staxed/site:1:pr_opened"]);
  });
});

describe("backfillPRs onlyRepos", () => {
  it("stores nothing for an empty set", async () => {
    const store = createMemoryStore();
    expect(await backfillPRs("2024-03-10T15:00:00.000Z", store, new Set())).toBe(0);
    expect(store.events).toEqual([]);
  });
});

describe("twoYearsBefore", () => {
  it("is the trigger time minus two years", () => {
    expect(twoYearsBefore(NOW)).toBe("2024-03-10T15:00:00.000Z");
  });
});
