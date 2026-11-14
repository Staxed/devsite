import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/activity/memory-store";

vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ github_username: "Staxed", github_org: "", timezone: "America/New_York", excluded_repos: ["Acme/hidden"] }),
}));
vi.mock("@/lib/quotes", () => ({ getRandomQuote: async () => null }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }));

import { discoverRepos, backfillRepoCommits, backfillPRs, backfillRepoPRs } from "./backfill";
import { backfillRepoActivity } from "./backfill-activity";
import { twoYearsBefore } from "@/lib/dates";
import { postHourlyDigest } from "@/lib/discord/digest";

const NOW = new Date("2026-03-10T15:00:00Z");
const COMMIT_TIME = "2026-03-09T14:00:00Z";

let requests: URL[];
let discordMessages: unknown[];
// total_count answered for a PR search window, keyed by its created: range; page results by the same key
let prSearch: Record<string, { total: number; items: unknown[] }>;
// answers for the per-repo activity listings, by path; a Response is returned as is
let activity: Record<string, unknown>;

const repoJson = (full: string, priv: boolean) => ({ id: full.length, full_name: full, name: full.split("/")[1], private: priv, owner: { login: full.split("/")[0] } });
const prItem = (n: number, repo: string, state = "open") => ({
  number: n, title: `PR ${n}`, state, html_url: `https://github.com/${repo}/pull/${n}`, repository_url: `https://api.github.com/repos/${repo}`,
  created_at: COMMIT_TIME, updated_at: COMMIT_TIME, pull_request: {},
});

// octokit's search throttle remembers its last call across tests, so the frozen clock only moves forward
let clock = NOW.getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock += 60_000;
  vi.setSystemTime(clock);
  process.env.GITHUB_EVENTS_TOKEN = "pat";
  process.env.DISCORD_CHANNEL_ID = "chan";
  process.env.DISCORD_BOT_TOKEN = "bot";
  requests = [];
  discordMessages = [];
  prSearch = {};
  activity = {};
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
      if (activity[url.pathname] !== undefined) {
        if (url.pathname === "/search/issues") vi.setSystemTime(Date.now() + 5000); // octokit spaces search calls by Date.now()
        if (activity[url.pathname] instanceof Response) return (activity[url.pathname] as Response).clone();
        const res = Response.json(activity[url.pathname]);
        // octokit's paginate reads response.url for search results; a bare Response has none
        Object.defineProperty(res, "url", { value: String(url) });
        return res;
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

describe("backfillRepoPRs", () => {
  it("searches one repo and stores its PRs as posted, private ones without a url", async () => {
    const store = createMemoryStore();
    prSearch["2024-03-10..2026-03-10"] = { total: 1, items: [prItem(4, "Acme/hidden")] };

    const inserted = await backfillRepoPRs({ id: 2, full_name: "Acme/hidden", owner: "Acme", name: "hidden", visibility: "private" }, "2024-03-10T15:00:00.000Z", store);

    expect(inserted).toBe(1);
    expect(store.events).toMatchObject([{ dedupe_key: "pr:Acme/hidden:4:pr_opened", url: null, visibility: "private", posted_to_discord: true }]);
    expect(requests.find((u) => u.pathname === "/search/issues")!.searchParams.get("q")).toContain("repo:Acme/hidden");
  });
});

describe("backfillRepoActivity", () => {
  const site = { id: 1, full_name: "Staxed/site", owner: "Staxed", name: "site", visibility: "public" as const };
  const SINCE = "2026-01-01T00:00:00.000Z";
  const me = { login: "Staxed" };

  // Every listing answers empty unless a test sets it; an unanswered route would send octokit into its retries
  beforeEach(() => {
    for (const repo of ["Staxed/site", "Acme/hidden"]) {
      for (const path of ["issues", "issues/comments", "pulls/comments", "comments", "releases", "forks", "stargazers", "events"]) {
        activity[`/repos/${repo}/${path}`] = [];
      }
    }
    activity["/search/issues"] = { total_count: 0, incomplete_results: false, items: [] };
  });

  it("sends since and the creator to the issues listing, and an old comment or release is left out", async () => {
    const store = createMemoryStore();
    activity["/repos/Staxed/site/issues"] = [];
    activity["/repos/Staxed/site/issues/comments"] = [
      { id: 1, user: me, body: "old", html_url: "u", created_at: "2025-06-01T00:00:00Z", issue_url: "https://api.github.com/repos/Staxed/site/issues/2" },
    ];
    activity["/repos/Staxed/site/releases"] = [{ tag_name: "v0", html_url: "u", published_at: "2025-06-01T00:00:00Z" }];

    const result = await backfillRepoActivity(site, SINCE, store);

    const issuesCall = requests.find((u) => u.pathname === "/repos/Staxed/site/issues")!;
    expect(issuesCall.searchParams.get("since")).toBe(SINCE);
    expect(issuesCall.searchParams.get("creator")).toBe("Staxed");
    expect(issuesCall.searchParams.get("state")).toBe("all");
    expect(requests.find((u) => u.pathname === "/repos/Staxed/site/issues/comments")!.searchParams.get("since")).toBe(SINCE);
    expect(store.events).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.found).toMatchObject({ issues: 0, issue_comments: 0, releases: 0 });
  });

  it("stores each issue's open and close under their own times, as posted, and nothing reaches Discord", async () => {
    const store = createMemoryStore();
    activity["/repos/Staxed/site/issues"] = [
      { number: 3, title: "Bug", user: me, state: "closed", html_url: "u", created_at: "2026-02-01T10:00:00Z", closed_at: "2026-02-02T10:00:00Z", updated_at: "2026-02-02T10:00:00Z" },
      // opened before the window, closed inside it: only the close is new
      { number: 4, title: "Old", user: me, state: "closed", html_url: "u", created_at: "2025-02-01T10:00:00Z", closed_at: "2026-02-03T10:00:00Z", updated_at: "2026-02-03T10:00:00Z" },
    ];

    await backfillRepoActivity(site, SINCE, store);

    expect(store.events.map((e) => [e.dedupe_key, e.occurred_at, e.posted_to_discord])).toEqual([
      ["issue:Staxed/site:3:issue_opened", "2026-02-01T10:00:00Z", true],
      ["issue:Staxed/site:3:issue_closed", "2026-02-02T10:00:00Z", true],
      ["issue:Staxed/site:4:issue_closed", "2026-02-03T10:00:00Z", true],
    ]);
    expect(discordMessages).toEqual([]);
  });

  it("keeps a private repo's issue title out of the row", async () => {
    const store = createMemoryStore();
    activity["/repos/Acme/hidden/issues"] = [
      { number: 3, title: "Secret plan", user: me, state: "open", html_url: "u", created_at: "2026-02-01T10:00:00Z", updated_at: "2026-02-01T10:00:00Z" },
    ];

    await backfillRepoActivity({ id: 2, full_name: "Acme/hidden", owner: "Acme", name: "hidden", visibility: "private" }, SINCE, store);

    expect(store.events).toMatchObject([{ dedupe_key: "issue:Acme/hidden:3:issue_opened", url: null, visibility: "private", repo_visibility: "private" }]);
  });

  it("reports a failing section and still stores the other sections", async () => {
    const store = createMemoryStore();
    vi.spyOn(console, "error").mockImplementation(() => {});
    activity["/repos/Staxed/site/issues"] = new Response("{}", { status: 422 });
    activity["/repos/Staxed/site/releases"] = [{ tag_name: "v1", name: "One", html_url: "u", published_at: "2026-02-01T10:00:00Z" }];

    const result = await backfillRepoActivity(site, SINCE, store);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^issues:/);
    expect(store.events.map((e) => e.dedupe_key)).toEqual(["release:Staxed/site:v1"]);
    expect(result.inserted).toBe(1);
  });

  it("stores nothing twice when run again", async () => {
    const store = createMemoryStore();
    activity["/repos/Staxed/site/releases"] = [{ tag_name: "v1", name: "One", html_url: "u", published_at: "2026-02-01T10:00:00Z" }];

    const first = await backfillRepoActivity(site, SINCE, store);
    const second = await backfillRepoActivity(site, SINCE, store);

    expect([first.inserted, second.inserted]).toEqual([1, 0]);
  });

  it("asks for star timestamps with the star media type", async () => {
    const store = createMemoryStore();
    const seen: Array<string | null> = [];
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname === "/repos/Staxed/site/stargazers") {
        seen.push(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get("accept"));
        return Response.json([{ starred_at: "2026-02-01T10:00:00Z", user: me }]);
      }
      return original(input, init);
    }));

    await backfillRepoActivity(site, SINCE, store);

    expect(seen).toEqual(["application/vnd.github.star+json"]);
    expect(store.events).toMatchObject([{ dedupe_key: "star:Staxed/site:Staxed", occurred_at: "2026-02-01T10:00:00Z" }]);
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
