import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/activity/memory-store";

vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ github_username: "Staxed", github_org: "", timezone: "America/New_York", excluded_repos: [] }),
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }));

import { pollGitHubEvents } from "./poller";
import { normalizeWebhookEvent } from "./normalize";

const NOW = new Date("2026-03-10T15:00:00Z");
const RECENT = "2026-03-10T14:00:00Z";
const OLD = "2026-03-09T20:00:00Z"; // 19h before NOW, past the 12h window

const me = { login: "Staxed" };
const repoJson = (full: string, priv: boolean) => ({ id: full.length, full_name: full, name: full.split("/")[1], private: priv, owner: { login: full.split("/")[0] } });
const feedEvent = (id: string, type: string, repo: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id, type, actor: me, repo: { name: repo }, public: true, created_at: RECENT, payload, ...extra,
});
const listedCommit = (sha: string, message = "Add feature") => ({ sha, html_url: `https://github.com/Staxed/site/commit/${sha}`, commit: { message, author: { date: RECENT } } });

// What the fake GitHub answers, by path; a number is an HTTP status
let answers: Record<string, unknown>;
let requests: URL[];
let included: string[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.GITHUB_EVENTS_TOKEN = "pat";
  requests = [];
  included = ["Staxed/site"];
  answers = {
    "/user/repos": [repoJson("Staxed/site", false), repoJson("Acme/hidden", true), repoJson("Staxed/other", false)],
    "/repos/Staxed/site/commits": [],
    "/repos/Staxed/site/events": [],
    "/repos/Acme/hidden/commits": [],
    "/repos/Acme/hidden/events": [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      requests.push(url);
      const answer = answers[url.pathname];
      if (typeof answer === "number") return new Response("{}", { status: answer });
      if (answer === undefined) return new Response("{}", { status: 404 }); // an unanswered lookup, e.g. a commit's line counts
      const page = url.searchParams.get("page");
      return Response.json(page && page !== "1" ? [] : answer);
    })
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function storeWithIncluded() {
  const store = createMemoryStore();
  await store.saveDiscordRepos(included.map((repo_full_name) => ({ repo_full_name, display_name: null, included: true })));
  return store;
}
const paths = () => requests.map((u) => u.pathname);

describe("pollGitHubEvents", () => {
  it("reads an included repo's own feed and default-branch commits, never the user feed or an excluded repo", async () => {
    const store = await storeWithIncluded();
    answers["/repos/Staxed/site/commits"] = [listedCommit("c1")];
    answers["/repos/Staxed/site/events"] = [feedEvent("1", "IssuesEvent", "Staxed/site", { action: "opened", issue: { number: 3 } })];
    answers["/repos/Staxed/site/issues/3"] = { number: 3, title: "Bug", html_url: "u", user: me };

    const result = await pollGitHubEvents(store);

    expect(result).toEqual({ fetched: 2, newEvents: 2, repos: 1 });
    expect(store.events.map((e) => e.dedupe_key).sort()).toEqual(["commit:Staxed/site:c1", "issue:Staxed/site:3:issue_opened"]);
    expect(paths().some((p) => p.startsWith("/users/") || p.includes("Staxed/other") || p.includes("Acme"))).toBe(false);
  });

  it("leaves every stored row unposted so the hourly digest sends it", async () => {
    const store = await storeWithIncluded();
    answers["/repos/Staxed/site/commits"] = [listedCommit("c1")];
    answers["/repos/Staxed/site/events"] = [feedEvent("1", "CreateEvent", "Staxed/site", { ref_type: "branch", ref: "feat" })];

    await pollGitHubEvents(store);

    expect(store.events).toHaveLength(2);
    expect(store.events.every((e) => !e.posted_to_discord)).toBe(true);
  });

  it("lists commits by Staxed since the cutoff", async () => {
    const store = await storeWithIncluded();

    await pollGitHubEvents(store, 12);

    const listing = requests.find((u) => u.pathname === "/repos/Staxed/site/commits")!;
    expect(listing.searchParams.get("author")).toBe("Staxed");
    expect(listing.searchParams.get("since")).toBe("2026-03-10T03:00:00.000Z");
  });

  it("costs one repo listing plus two requests per included repo when nothing is new", async () => {
    included = ["Staxed/site", "Acme/hidden"];
    const store = await storeWithIncluded();

    const result = await pollGitHubEvents(store);

    expect(result).toEqual({ fetched: 0, newEvents: 0, repos: 2 });
    expect(paths().sort()).toEqual(["/repos/Acme/hidden/commits", "/repos/Acme/hidden/events", "/repos/Staxed/site/commits", "/repos/Staxed/site/events", "/user/repos"]);
  });

  it("makes no request when no repo is included", async () => {
    const store = createMemoryStore();

    expect(await pollGitHubEvents(store)).toEqual({ fetched: 0, newEvents: 0, repos: 0 });
    expect(requests).toEqual([]);
  });

  it("ignores feed events older than the window and stops paging at them", async () => {
    const store = await storeWithIncluded();
    answers["/repos/Staxed/site/events"] = [
      feedEvent("1", "CreateEvent", "Staxed/site", { ref_type: "branch", ref: "new" }),
      feedEvent("2", "CreateEvent", "Staxed/site", { ref_type: "branch", ref: "stale" }, { created_at: OLD }),
    ];

    await pollGitHubEvents(store);

    expect(store.events.map((e) => e.dedupe_key)).toEqual(["create:Staxed/site:branch:new"]);
  });

  it("needs no compare lookup for a push whose head commit the listing already gave, and looks up a push to another branch", async () => {
    const store = await storeWithIncluded();
    answers["/repos/Staxed/site/commits"] = [listedCommit("main1")];
    answers["/repos/Staxed/site/events"] = [
      feedEvent("1", "PushEvent", "Staxed/site", { before: "b0", head: "main1", ref: "refs/heads/main" }),
      feedEvent("2", "PushEvent", "Staxed/site", { before: "b1", head: "feat1", ref: "refs/heads/feat" }),
    ];
    answers["/repos/Staxed/site/compare/b1...feat1"] = { commits: [{ sha: "feat1", commit: { message: "On a branch", author: { name: "Staxed", email: "e" } }, author: me }] };

    await pollGitHubEvents(store);

    expect(paths()).not.toContain("/repos/Staxed/site/compare/b0...main1");
    expect(paths()).toContain("/repos/Staxed/site/compare/b1...feat1");
    expect(store.events.map((e) => e.dedupe_key).sort()).toEqual(["commit:Staxed/site:feat1", "commit:Staxed/site:main1"]);
  });

  it("stores one row for an event the webhook stored first", async () => {
    const store = await storeWithIncluded();
    const webhook = await normalizeWebhookEvent(
      "issues",
      { action: "opened", issue: { number: 3, title: "Bug", html_url: "u", user: me, updated_at: RECENT }, repository: { full_name: "Staxed/site", private: false } },
      { github_username: "Staxed", timezone: "America/New_York" }
    );
    await store.upsertEvents(webhook);
    answers["/repos/Staxed/site/events"] = [feedEvent("1", "IssuesEvent", "Staxed/site", { action: "opened", issue: { number: 3 } })];
    answers["/repos/Staxed/site/issues/3"] = { number: 3, title: "Bug", html_url: "u", user: me };

    const result = await pollGitHubEvents(store);

    expect(result.newEvents).toBe(0);
    expect(store.events).toHaveLength(1);
  });

  it("drops someone else's PR even when Staxed acted on it", async () => {
    const store = await storeWithIncluded();
    answers["/repos/Staxed/site/events"] = [feedEvent("1", "PullRequestEvent", "Staxed/site", { action: "closed", number: 9 })];
    answers["/repos/Staxed/site/pulls/9"] = { number: 9, title: "Theirs", merged: true, html_url: "u", user: { login: "someone" } };

    await pollGitHubEvents(store);

    expect(store.events).toEqual([]);
  });

  it("stores a private repo's events without titles or urls from the repo", async () => {
    included = ["Acme/hidden"];
    const store = await storeWithIncluded();
    answers["/repos/Acme/hidden/events"] = [feedEvent("1", "CreateEvent", "Acme/hidden", { ref_type: "branch", ref: "secret-feature" }, { public: false })];

    await pollGitHubEvents(store);

    expect(store.events).toMatchObject([{ dedupe_key: "create:Acme/hidden:branch:secret-feature", visibility: "private", url: null, public_summary: "Activity in a private repository" }]);
  });

  it("logs and skips a repo that fails, and still stores the others", async () => {
    included = ["Acme/hidden", "Staxed/site"];
    const store = await storeWithIncluded();
    answers["/repos/Acme/hidden/events"] = 404;
    answers["/repos/Staxed/site/commits"] = [listedCommit("c1")];

    const result = await pollGitHubEvents(store);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Acme/hidden"), expect.anything());
    expect(store.events.map((e) => e.dedupe_key)).toEqual(["commit:Staxed/site:c1"]);
    expect(result.repos).toBe(2);
  });

  it("skips an included repo the token cannot list", async () => {
    included = ["Gone/repo", "Staxed/site"];
    const store = await storeWithIncluded();

    const result = await pollGitHubEvents(store);

    expect(result.repos).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Gone/repo"));
  });

  it.each([401, 403])("stops the whole poll on a %i", async (status) => {
    included = ["Acme/hidden", "Staxed/site"];
    const store = await storeWithIncluded();
    answers["/repos/Acme/hidden/events"] = status;

    await expect(pollGitHubEvents(store)).rejects.toThrow();
    expect(paths()).not.toContain("/repos/Staxed/site/events");
  });

  it("stops with a named error when GITHUB_EVENTS_TOKEN is missing", async () => {
    delete process.env.GITHUB_EVENTS_TOKEN;

    await expect(pollGitHubEvents(await storeWithIncluded())).rejects.toThrow(/GITHUB_EVENTS_TOKEN/);
  });
});
