import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMemoryStore } from "./memory-store";

vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ github_username: "Staxed", github_org: "", timezone: "America/New_York", excluded_repos: [] }),
}));
vi.mock("@/lib/quotes", () => ({ getRandomQuote: async () => null }));
// Delivery bookkeeping only; every activity table goes through the store.
vi.mock("@/lib/supabase/server", () => {
  const chain: unknown = new Proxy(() => chain, {
    get: (_t, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve({ error: null, data: null }) : chain),
    apply: () => chain,
  });
  return { createAdminClient: () => chain };
});

import { recordCommitLines } from "@/lib/github/commit-lines";
import { pollGitHubEvents } from "@/lib/github/poller";
import { handleGitHubWebhook } from "@/lib/github/webhook";
import { postSummaries } from "@/lib/discord/summaries";
import { checkAchievements } from "@/lib/achievements/engine";

const NOW = new Date("2026-03-10T15:00:00Z");
const COMMIT_TIME = "2026-03-10T14:00:00Z";
const SHA = "abc123";
const REPO = "Staxed/site";
const WEBHOOK_SECRET = "hook-secret";

let discordMessages: unknown[];
let githubEvents: unknown[];
// compare/commit lookups by head sha; a missing entry answers 404
let restCommits: Record<string, unknown[]>;
let restResources: Record<string, unknown>;
let githubUrls: string[];
let restStatus: number | null;
// default-branch commits the poll lists for the repo
let branchCommits: unknown[];
// GET commit answers by sha, for the line-count lookup; a missing entry falls back to restCommits
let commitDetails: Record<string, unknown>;
let commitDetailStatus: number | null = null;

const restCommit = (sha: string, message: string, login = "Staxed", email = "staxed@users.noreply.github.com") => ({
  sha,
  commit: { message, author: { name: login, email } },
  author: { login },
});
const slimPush = (id: string, before: string, head: string) => ({
  id, type: "PushEvent", actor: { login: "Staxed" }, repo: { name: REPO }, public: true, created_at: COMMIT_TIME,
  payload: { before, head },
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.DISCORD_CHANNEL_ID = "chan";
  process.env.DISCORD_BOT_TOKEN = "bot";
  process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.GITHUB_EVENTS_TOKEN = "pat";
  discordMessages = [];
  githubUrls = [];
  restResources = {};
  commitDetails = {};
  commitDetailStatus = null;
  restStatus = null;
  branchCommits = [];
  githubEvents = [slimPush("1", "b0", SHA)];
  restCommits = { [SHA]: [restCommit(SHA, "Add feature")] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("discord.com")) {
        discordMessages.push(JSON.parse(String(init?.body)));
        return Response.json({ id: `msg-${discordMessages.length}` });
      }
      if (url.includes("api.github.com") && url.includes("/events")) {
        return Response.json(url.includes("page=1") ? githubEvents : []);
      }
      githubUrls.push(url);
      if (restStatus && !url.includes("/events")) return new Response("denied", { status: restStatus });
      if (url.includes("api.github.com/user/repos")) {
        return Response.json(url.includes("page=1") ? [{ id: 1, full_name: REPO, name: "site", private: false, owner: { login: "Staxed" } }] : []);
      }
      if (/\/repos\/[^/]+\/[^/]+\/commits\?/.test(url)) return Response.json(url.includes("page=1") || !url.includes("page=") ? branchCommits : []);
      const lookup = url.match(/\/repos\/[^/]+\/[^/]+\/(pulls|issues)\/(\d+)$/);
      if (lookup) {
        const found = restResources[`${lookup[1]}/${lookup[2]}`];
        return found ? Response.json(found) : new Response("nope", { status: 404 });
      }
      if (/\/compare\/0{40}\.\.\./.test(url)) return new Response("no base", { status: 404 });
      const detail = url.match(/\/repos\/[^/]+\/[^/]+\/commits\/(\w+)$/);
      if (detail && commitDetailStatus) return new Response("boom", { status: commitDetailStatus });
      if (detail && commitDetails[detail[1]]) return Response.json(commitDetails[detail[1]]);
      const rest = url.match(/\/repos\/[^/]+\/[^/]+\/(?:compare\/[^.]+\.\.\.|commits\/)(\w+)/);
      if (rest) {
        const found = restCommits[rest[1]];
        if (!found) return new Response("boom", { status: 404 });
        return Response.json(url.includes("/compare/") ? { commits: found } : found[0]);
      }
      throw new Error(`Unexpected fetch ${url}`);
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The poll reads included repos only: include the test repo, then poll. */
async function poll(store: ReturnType<typeof createMemoryStore>) {
  await store.saveDiscordRepos([{ repo_full_name: REPO, display_name: null, included: true }]);
  return pollGitHubEvents(store);
}

async function deliverPush(store: ReturnType<typeof createMemoryStore>) {
  const body = JSON.stringify({
    repository: { full_name: REPO, private: false },
    commits: [{ id: SHA, message: "Add feature", timestamp: COMMIT_TIME, url: "u", author: { username: "Staxed" } }],
  });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
  const request = new NextRequest("http://localhost/api/github/webhook", {
    method: "POST",
    body,
    headers: { "x-hub-signature-256": `sha256=${sig}`, "x-github-event": "push", "x-github-delivery": "d1" },
  });
  const response = await handleGitHubWebhook(request, store);
  expect(response.status).toBe(200);
}

describe("ingest sends nothing to Discord", () => {
  it("the webhook stores the commit and sends nothing", async () => {
    const store = createMemoryStore();
    await deliverPush(store);

    expect(store.events.filter((e) => e.kind === "commit_pushed")).toHaveLength(1);
    expect(discordMessages).toHaveLength(0);
  });

  it("the poll stores the commit and sends nothing, even over an old unposted event", async () => {
    const store = createMemoryStore();
    await store.upsertEvents([
      {
        occurred_at: "2026-03-10T12:00:00Z", occurred_on: "2026-03-10", source: "github", category: "code",
        kind: "commit_pushed", value: 1, unit: "count", title: "Stranded commit", public_summary: null,
        visibility: "public", repo_visibility: "public", repo_hash: "h", url: null, metadata: { repo: REPO },
        dedupe_key: "commit:Staxed/site:stranded",
      },
    ]);

    await poll(store);

    expect(store.events.filter((e) => e.kind === "commit_pushed")).toHaveLength(2);
    expect(store.events.every((e) => !e.posted_to_discord)).toBe(true);
    expect(discordMessages).toHaveLength(0);
  });

  it("stores the same commit once whichever of webhook and poll comes first", async () => {
    const store = createMemoryStore();
    await deliverPush(store);
    await poll(store);
    await deliverPush(store);

    expect(store.events.filter((e) => e.kind === "commit_pushed")).toHaveLength(1);
    expect(discordMessages).toHaveLength(0);
  });
});

describe("pushes through the Events API", () => {
  const commitRows = (store: ReturnType<typeof createMemoryStore>) => store.events.filter((e) => e.kind === "commit_pushed");

  it("stores a commit row per compare commit", async () => {
    const store = createMemoryStore();
    githubEvents = [slimPush("1", "b0", "h2")];
    restCommits = { h2: [restCommit("c1", "First"), restCommit("c2", "Second")] };

    await poll(store);

    expect(commitRows(store).map((e) => e.dedupe_key).sort()).toEqual([`commit:${REPO}:c1`, `commit:${REPO}:c2`]);
  });

  it("fetches the head commit when a new branch has an all-zero before", async () => {
    const store = createMemoryStore();
    githubEvents = [slimPush("1", "0".repeat(40), "h3")];
    restCommits = { h3: [restCommit("h3", "Branch start")] };

    await poll(store);

    expect(commitRows(store).map((e) => e.dedupe_key)).toEqual([`commit:${REPO}:h3`]);
    expect(githubUrls.some((u) => u.includes("/commits/h3"))).toBe(true);
    expect(githubUrls.some((u) => u.includes("/compare/"))).toBe(false);
  });

  it("makes no REST call for a branch deletion", async () => {
    const store = createMemoryStore();
    githubEvents = [slimPush("1", "b0", "0".repeat(40))];

    await poll(store);

    expect(commitRows(store)).toHaveLength(0);
    expect(githubUrls.some((u) => u.includes("/compare/") || u.includes("/commits/"))).toBe(false);
  });

  it("keeps a commit linked to Staxed only by its author login", async () => {
    const store = createMemoryStore();
    githubEvents = [slimPush("1", "b0", "h5")];
    restCommits = { h5: [{ sha: "c9", commit: { message: "Login only", author: { name: "Someone", email: "x@example.com" } }, author: { login: "staxed" } }] };

    await poll(store);

    expect(commitRows(store).map((e) => e.dedupe_key)).toEqual([`commit:${REPO}:c9`]);
  });

  it("fills a pull request event from the REST resource", async () => {
    const store = createMemoryStore();
    githubEvents = [{
      id: "9", type: "PullRequestEvent", actor: { login: "Staxed" }, repo: { name: REPO }, public: true, created_at: COMMIT_TIME,
      payload: { action: "opened", number: 7 },
    }];
    restResources = { "pulls/7": { number: 7, title: "Fetched PR title", state: "open", merged: false, html_url: "https://github.com/Staxed/site/pull/7", user: { login: "Staxed" } } };

    await poll(store);

    expect(JSON.stringify(store.events)).toContain("Fetched PR title");
    expect(githubUrls.some((u) => u.endsWith("/pulls/7"))).toBe(true);
  });

  it("fills an issue event from the REST resource", async () => {
    const store = createMemoryStore();
    githubEvents = [{
      id: "10", type: "IssuesEvent", actor: { login: "Staxed" }, repo: { name: REPO }, public: true, created_at: COMMIT_TIME,
      payload: { action: "opened", issue: { number: 3 } },
    }];
    restResources = { "issues/3": { number: 3, title: "Fetched issue title", state: "open", html_url: "https://github.com/Staxed/site/issues/3", user: { login: "Staxed" } } };

    await poll(store);

    expect(githubUrls.some((u) => u.endsWith("/issues/3"))).toBe(true);
    expect(JSON.stringify(store.events)).toContain("Fetched issue title");
  });

  it("stops the poll on an auth failure instead of skipping every event", async () => {
    restStatus = 401;
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(poll(createMemoryStore())).rejects.toThrow();
  });

  it("stops the poll with a named error when GITHUB_EVENTS_TOKEN is missing", async () => {
    delete process.env.GITHUB_EVENTS_TOKEN;

    await expect(poll(createMemoryStore())).rejects.toThrow(/GITHUB_EVENTS_TOKEN/);
  });

  it("drops commits not authored by Staxed", async () => {
    const store = createMemoryStore();
    githubEvents = [slimPush("1", "b0", "h4")];
    restCommits = { h4: [restCommit("c1", "Mine"), restCommit("c2", "Theirs", "other", "other@example.com")] };

    await poll(store);

    expect(commitRows(store).map((e) => e.dedupe_key)).toEqual([`commit:${REPO}:c1`]);
  });

  it("skips only the event whose REST lookup fails", async () => {
    const store = createMemoryStore();
    githubEvents = [slimPush("1", "b0", "broken"), slimPush("2", "b1", "good")];
    restCommits = { good: [restCommit("g1", "Good commit")] };
    vi.spyOn(console, "error").mockImplementation(() => {});

    await poll(store);

    expect(commitRows(store).map((e) => e.dedupe_key)).toEqual([`commit:${REPO}:g1`]);
  });
});

const commitLines = (store: ReturnType<typeof createMemoryStore>) =>
  store.events.filter((e) => e.kind === "commit_pushed").map((e) => [e.lines_added ?? null, e.lines_removed ?? null]);
const commitLookups = () => githubUrls.filter((u) => u.endsWith(`/commits/${SHA}`)).length;

describe("line counts at ingest", () => {
  const detail = (parents: number, additions = 12, deletions = 3) => ({
    ...restCommit(SHA, "Add feature"),
    parents: Array.from({ length: parents }, (_, i) => ({ sha: `p${i}` })),
    stats: { additions, deletions, total: additions + deletions },
  });

  it("gives a new own commit both columns, from the webhook", async () => {
    commitDetails = { [SHA]: detail(1) };
    const store = createMemoryStore();
    await deliverPush(store);
    expect(commitLines(store)).toEqual([[12, 3]]);
  });

  it("gives a new own commit both columns, from the poll", async () => {
    commitDetails = { [SHA]: detail(1) };
    const store = createMemoryStore();
    await poll(store);
    expect(commitLines(store)).toEqual([[12, 3]]);
  });

  it("leaves a merge commit empty and still stores it", async () => {
    commitDetails = { [SHA]: detail(2) };
    const store = createMemoryStore();
    await deliverPush(store);
    expect(commitLines(store)).toEqual([[null, null]]);
  });

  it("leaves the columns empty and still stores the commit when the lookup fails", async () => {
    commitDetails = { [SHA]: { ...detail(1), stats: undefined } };
    const store = createMemoryStore();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await deliverPush(store);
    expect(commitLines(store)).toEqual([[null, null]]);
  });

  it("leaves the columns empty, logs, and still stores the commit when GET commit returns 500", async () => {
    commitDetails = { [SHA]: detail(1) };
    commitDetailStatus = 500;
    const store = createMemoryStore();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await deliverPush(store);
    expect(commitLines(store)).toEqual([[null, null]]);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("Line count lookup failed"), expect.anything());
  });

  it("stops with a named error when GITHUB_EVENTS_TOKEN is missing", async () => {
    const store = createMemoryStore();
    delete process.env.GITHUB_EVENTS_TOKEN;
    const { event } = { event: { kind: "commit_pushed", dedupe_key: "k", metadata: { repo: REPO, sha: SHA } } };
    await expect(recordCommitLines(store, [event as never])).rejects.toThrow(/GITHUB_EVENTS_TOKEN/);
  });

  it("does not look up a commit that is already stored", async () => {
    commitDetails = { [SHA]: detail(1) };
    const store = createMemoryStore();
    await deliverPush(store);
    await poll(store);
    await deliverPush(store);
    expect(commitLookups()).toBe(1);
  });
});

describe("summaries", () => {
  it("posts a daily summary once when the run is called twice", async () => {
    const store = createMemoryStore();
    // Tuesday 10:00 New York: only the daily summary is due
    vi.setSystemTime(new Date("2026-03-10T14:00:00Z"));

    const first = await postSummaries(store, "chan");
    const second = await postSummaries(store, "chan");

    expect(first).toEqual([{ type: "daily", sent: true }]);
    expect(second).toEqual([{ type: "daily", sent: false }]);
    expect(discordMessages).toHaveLength(1);
    expect(store.summaries[0].message_id).toBe("msg-1");
  });
});

describe("achievements", () => {
  it("does not return an achievement that is already recorded", async () => {
    const store = createMemoryStore();
    await store.upsertEvents([
      {
        occurred_at: COMMIT_TIME, occurred_on: "2026-03-10", source: "github", category: "code",
        kind: "commit_pushed", value: 1, unit: "count", title: "x".repeat(101), public_summary: null,
        visibility: "public", repo_visibility: "public", repo_hash: "h", url: null, metadata: {}, dedupe_key: "commit:a:b",
      },
    ]);

    const first = await checkAchievements(store, store.events);
    const second = await checkAchievements(store, store.events);

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual([]);
  });
});
