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
  restStatus = null;
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
      const lookup = url.match(/\/repos\/[^/]+\/[^/]+\/(pulls|issues)\/(\d+)$/);
      if (lookup) {
        const found = restResources[`${lookup[1]}/${lookup[2]}`];
        return found ? Response.json(found) : new Response("nope", { status: 404 });
      }
      if (/\/compare\/0{40}\.\.\./.test(url)) return new Response("no base", { status: 404 });
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

const commitEmbedMessages = () =>
  discordMessages.filter((m) => JSON.stringify(m).includes("Add feature"));

describe("posting once across webhook and poll", () => {
  it("stores the same commit once and posts it once, webhook first", async () => {
    const store = createMemoryStore();
    await deliverPush(store);
    await pollGitHubEvents(store);

    expect(store.events.filter((e) => e.kind === "commit_pushed")).toHaveLength(1);
    expect(commitEmbedMessages()).toHaveLength(1);
  });

  it("stores the same commit once and posts it once, poll first", async () => {
    const store = createMemoryStore();
    await pollGitHubEvents(store);
    await deliverPush(store);

    expect(store.events.filter((e) => e.kind === "commit_pushed")).toHaveLength(1);
    expect(commitEmbedMessages()).toHaveLength(1);
  });

  it("posts nothing on a second poll over the same window", async () => {
    const store = createMemoryStore();
    await pollGitHubEvents(store);
    const sent = discordMessages.length;
    expect(sent).toBeGreaterThan(0);

    const second = await pollGitHubEvents(store);

    expect(discordMessages).toHaveLength(sent);
    expect(second.posted).toBe(false);
  });

  it("recovers an old unposted event once and never re-posts claimed events", async () => {
    const store = createMemoryStore();
    await store.upsertEvents([
      {
        occurred_at: "2026-03-10T12:00:00Z", occurred_on: "2026-03-10", source: "github", category: "code",
        kind: "commit_pushed", value: 1, unit: "count", title: "Stranded commit", public_summary: null,
        visibility: "public", repo_visibility: "public", repo_hash: "h", url: null, metadata: { repo: REPO },
        dedupe_key: "commit:Staxed/site:stranded",
      },
    ]);
    githubEvents = [];

    const first = await pollGitHubEvents(store);
    const sent = discordMessages.length;
    const second = await pollGitHubEvents(store);

    expect(first.recovered).toBe(1);
    expect(JSON.stringify(discordMessages)).toContain("Stranded commit");
    expect(second.recovered).toBe(0);
    expect(discordMessages).toHaveLength(sent);
  });
});

describe("pushes through the Events API", () => {
  const commitRows = (store: ReturnType<typeof createMemoryStore>) => store.events.filter((e) => e.kind === "commit_pushed");

  it("stores a commit row per compare commit and posts once", async () => {
    const store = createMemoryStore();
    githubEvents = [slimPush("1", "b0", "h2")];
    restCommits = { h2: [restCommit("c1", "First"), restCommit("c2", "Second")] };

    await pollGitHubEvents(store);

    expect(commitRows(store).map((e) => e.dedupe_key).sort()).toEqual([`commit:${REPO}:c1`, `commit:${REPO}:c2`]);
    expect(discordMessages).toHaveLength(1);
  });

  it("fetches the head commit when a new branch has an all-zero before", async () => {
    const store = createMemoryStore();
    githubEvents = [slimPush("1", "0".repeat(40), "h3")];
    restCommits = { h3: [restCommit("h3", "Branch start")] };

    await pollGitHubEvents(store);

    expect(commitRows(store).map((e) => e.dedupe_key)).toEqual([`commit:${REPO}:h3`]);
    expect(githubUrls.some((u) => u.includes("/commits/h3"))).toBe(true);
    expect(githubUrls.some((u) => u.includes("/compare/"))).toBe(false);
  });

  it("makes no REST call for a branch deletion", async () => {
    const store = createMemoryStore();
    githubEvents = [slimPush("1", "b0", "0".repeat(40))];

    await pollGitHubEvents(store);

    expect(commitRows(store)).toHaveLength(0);
    expect(githubUrls.some((u) => u.includes("/compare/") || u.includes("/commits/"))).toBe(false);
  });

  it("keeps a commit linked to Staxed only by its author login", async () => {
    const store = createMemoryStore();
    githubEvents = [slimPush("1", "b0", "h5")];
    restCommits = { h5: [{ sha: "c9", commit: { message: "Login only", author: { name: "Someone", email: "x@example.com" } }, author: { login: "staxed" } }] };

    await pollGitHubEvents(store);

    expect(commitRows(store).map((e) => e.dedupe_key)).toEqual([`commit:${REPO}:c9`]);
  });

  it("fills a pull request event from the REST resource", async () => {
    const store = createMemoryStore();
    githubEvents = [{
      id: "9", type: "PullRequestEvent", actor: { login: "Staxed" }, repo: { name: REPO }, public: true, created_at: COMMIT_TIME,
      payload: { action: "opened", number: 7 },
    }];
    restResources = { "pulls/7": { number: 7, title: "Fetched PR title", state: "open", merged: false, html_url: "https://github.com/Staxed/site/pull/7", user: { login: "Staxed" } } };

    await pollGitHubEvents(store);

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

    await pollGitHubEvents(store);

    expect(githubUrls.some((u) => u.endsWith("/issues/3"))).toBe(true);
    expect(JSON.stringify(store.events)).toContain("Fetched issue title");
  });

  it("stops the poll on an auth failure instead of skipping every event", async () => {
    restStatus = 401;
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(pollGitHubEvents(createMemoryStore())).rejects.toThrow();
  });

  it("stops the poll with a named error when GITHUB_EVENTS_TOKEN is missing", async () => {
    delete process.env.GITHUB_EVENTS_TOKEN;

    await expect(pollGitHubEvents(createMemoryStore())).rejects.toThrow(/GITHUB_EVENTS_TOKEN/);
  });

  it("drops commits not authored by Staxed", async () => {
    const store = createMemoryStore();
    githubEvents = [slimPush("1", "b0", "h4")];
    restCommits = { h4: [restCommit("c1", "Mine"), restCommit("c2", "Theirs", "other", "other@example.com")] };

    await pollGitHubEvents(store);

    expect(commitRows(store).map((e) => e.dedupe_key)).toEqual([`commit:${REPO}:c1`]);
  });

  it("skips only the event whose REST lookup fails", async () => {
    const store = createMemoryStore();
    githubEvents = [slimPush("1", "b0", "broken"), slimPush("2", "b1", "good")];
    restCommits = { good: [restCommit("g1", "Good commit")] };
    vi.spyOn(console, "error").mockImplementation(() => {});

    await pollGitHubEvents(store);

    expect(commitRows(store).map((e) => e.dedupe_key)).toEqual([`commit:${REPO}:g1`]);
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
  it("posts no achievement embed when the poll's achievements are already recorded", async () => {
    const store = createMemoryStore();
    await pollGitHubEvents(store);
    const achievementEmbeds = () => discordMessages.filter((m) => JSON.stringify(m).includes("Achievement Unlocked"));
    // Pre-record whatever the first poll earned, then post a fresh event through the same path
    const before = achievementEmbeds().length;
    githubEvents = [slimPush("2", SHA, "def456")];
    restCommits = { def456: [restCommit("def456", "Second feature")] };
    await pollGitHubEvents(store);

    expect(JSON.stringify(discordMessages)).toContain("Second feature");
    expect(achievementEmbeds()).toHaveLength(before);
  });

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
