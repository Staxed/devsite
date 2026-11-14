/**
 * Webhook, poll and backfill must store one row for one real-world event: the same kind,
 * the same dedupe_key, and the same decision about whose activity counts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/activity/memory-store";

vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ github_username: "Staxed", github_org: "", timezone: "America/New_York", excluded_repos: [] }),
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }));

import { normalizeWebhookEvent } from "./normalize";
import { normalizeEventsApiResponse, type GitHubEvent } from "./normalize-events-api";
import { backfillRepoActivity } from "./backfill-activity";
import { backfillRepoCommits, backfillRepoPRs } from "./backfill";

const SETTINGS = { github_username: "Staxed", timezone: "America/New_York" };
const REPO = "Staxed/site";
const repository = { full_name: REPO, private: false, html_url: `https://github.com/${REPO}` };
const me = { login: "Staxed" };
const other = { login: "someone" };
const WHEN = "2026-03-09T14:00:00Z";
const SINCE = "2026-01-01T00:00:00.000Z";

const pr = (n: number, extra: Record<string, unknown> = {}) => ({ number: n, title: `PR ${n}`, html_url: `https://github.com/${REPO}/pull/${n}`, merged: false, user: me, updated_at: WHEN, ...extra });
const issue = (n: number, extra: Record<string, unknown> = {}) => ({ number: n, title: `Issue ${n}`, html_url: `https://github.com/${REPO}/issues/${n}`, user: me, updated_at: WHEN, ...extra });
const comment = (id: number, extra: Record<string, unknown> = {}) => ({ id, user: me, body: "hello\nsecond line", html_url: `https://github.com/${REPO}/x#c${id}`, created_at: WHEN, ...extra });
const release = { tag_name: "v1.0.0", name: "One", html_url: `https://github.com/${REPO}/releases/v1.0.0`, published_at: WHEN };
const review = { id: 11, user: me, state: "approved", html_url: `https://github.com/${REPO}/pull/7#r11`, submitted_at: WHEN };
const forkee = { full_name: "Staxed/site-fork", html_url: "https://github.com/Staxed/site-fork", created_at: WHEN };

interface Case {
  name: string;
  webhook: [string, Record<string, unknown>];
  /** The same event as the repo events feed lists it, after enrichment. */
  feed: Omit<GitHubEvent, "id" | "repo" | "public" | "created_at">;
  /** Whether the event belongs to Staxed; a false case must produce nothing on both sides. */
  counts?: boolean;
}

const feedActor = me;
const cases: Case[] = [
  { name: "commit", webhook: ["push", { commits: [{ id: "c1", message: "Add", timestamp: WHEN, url: "u", author: { username: "Staxed" } }] }],
    feed: { type: "PushEvent", actor: feedActor, payload: { commits: [{ sha: "c1", message: "Add", distinct: true, author: { name: "x", email: "x@y", login: "Staxed" } }] } } },
  { name: "commit by someone else", counts: false, webhook: ["push", { commits: [{ id: "c2", message: "Add", timestamp: WHEN, url: "u", author: { username: "someone" } }] }],
    feed: { type: "PushEvent", actor: feedActor, payload: { commits: [{ sha: "c2", message: "Add", distinct: true, author: { name: "Staxed", email: "staxed@users.noreply.github.com", login: "someone" } }] } } },
  { name: "pr opened", webhook: ["pull_request", { action: "opened", pull_request: pr(7) }], feed: { type: "PullRequestEvent", actor: feedActor, payload: { action: "opened", number: 7, pull_request: pr(7) } } },
  { name: "pr merged", webhook: ["pull_request", { action: "closed", pull_request: pr(7, { merged: true }) }], feed: { type: "PullRequestEvent", actor: feedActor, payload: { action: "closed", number: 7, pull_request: pr(7, { merged: true }) } } },
  { name: "pr closed", webhook: ["pull_request", { action: "closed", pull_request: pr(8) }], feed: { type: "PullRequestEvent", actor: feedActor, payload: { action: "closed", number: 8, pull_request: pr(8) } } },
  { name: "someone else's pr that Staxed merged", counts: false, webhook: ["pull_request", { action: "closed", pull_request: pr(9, { merged: true, user: other }) }],
    feed: { type: "PullRequestEvent", actor: feedActor, payload: { action: "closed", number: 9, pull_request: pr(9, { merged: true, user: other }) } } },
  { name: "issue opened", webhook: ["issues", { action: "opened", issue: issue(3) }], feed: { type: "IssuesEvent", actor: feedActor, payload: { action: "opened", issue: issue(3) } } },
  { name: "issue closed", webhook: ["issues", { action: "closed", issue: issue(3) }], feed: { type: "IssuesEvent", actor: feedActor, payload: { action: "closed", issue: issue(3) } } },
  { name: "someone else's issue that Staxed closed", counts: false, webhook: ["issues", { action: "closed", issue: issue(4, { user: other }) }], feed: { type: "IssuesEvent", actor: feedActor, payload: { action: "closed", issue: issue(4, { user: other }) } } },
  { name: "release", webhook: ["release", { action: "published", release }], feed: { type: "ReleaseEvent", actor: feedActor, payload: { action: "published", release } } },
  { name: "release published by a bot", webhook: ["release", { action: "published", release: { ...release, tag_name: "v2" } }], feed: { type: "ReleaseEvent", actor: { login: "github-actions[bot]" }, payload: { action: "published", release: { ...release, tag_name: "v2" } } } },
  { name: "review", webhook: ["pull_request_review", { action: "submitted", review, pull_request: { number: 7 } }], feed: { type: "PullRequestReviewEvent", actor: feedActor, payload: { action: "created", review, pull_request: { number: 7 } } } },
  { name: "branch created", webhook: ["create", { ref_type: "branch", ref: "feat/x", sender: me }], feed: { type: "CreateEvent", actor: feedActor, payload: { ref_type: "branch", ref: "feat/x" } } },
  { name: "tag created", webhook: ["create", { ref_type: "tag", ref: "v1", sender: me }], feed: { type: "CreateEvent", actor: feedActor, payload: { ref_type: "tag", ref: "v1" } } },
  { name: "branch created by someone else", counts: false, webhook: ["create", { ref_type: "branch", ref: "theirs", sender: other }], feed: { type: "CreateEvent", actor: other, payload: { ref_type: "branch", ref: "theirs" } } },
  { name: "branch deleted", webhook: ["delete", { ref_type: "branch", ref: "feat/x", sender: me }], feed: { type: "DeleteEvent", actor: feedActor, payload: { ref_type: "branch", ref: "feat/x" } } },
  { name: "tag deleted", webhook: ["delete", { ref_type: "tag", ref: "v1", sender: me }], feed: { type: "DeleteEvent", actor: feedActor, payload: { ref_type: "tag", ref: "v1" } } },
  { name: "fork", webhook: ["fork", { forkee, sender: me }], feed: { type: "ForkEvent", actor: feedActor, payload: { forkee } } },
  { name: "star", webhook: ["watch", { action: "started", sender: me }], feed: { type: "WatchEvent", actor: feedActor, payload: { action: "started" } } },
  { name: "star by someone else", counts: false, webhook: ["watch", { action: "started", sender: other }], feed: { type: "WatchEvent", actor: other, payload: { action: "started" } } },
  { name: "issue comment", webhook: ["issue_comment", { action: "created", comment: comment(21), issue: { number: 3 } }], feed: { type: "IssueCommentEvent", actor: feedActor, payload: { action: "created", comment: comment(21), issue: { number: 3 } } } },
  { name: "issue comment by someone else", counts: false, webhook: ["issue_comment", { action: "created", comment: comment(22, { user: other }), issue: { number: 3 } }], feed: { type: "IssueCommentEvent", actor: other, payload: { action: "created", comment: comment(22, { user: other }), issue: { number: 3 } } } },
  { name: "pr review comment", webhook: ["pull_request_review_comment", { action: "created", comment: comment(31), pull_request: { number: 7 } }], feed: { type: "PullRequestReviewCommentEvent", actor: feedActor, payload: { action: "created", comment: comment(31), pull_request: { number: 7 } } } },
  { name: "commit comment", webhook: ["commit_comment", { action: "created", comment: comment(41, { commit_id: "abcdef123456" }) }], feed: { type: "CommitCommentEvent", actor: feedActor, payload: { action: "created", comment: comment(41, { commit_id: "abcdef123456" }) } } },
  { name: "member added", webhook: ["member", { action: "added", member: { login: "friend" }, sender: me }], feed: { type: "MemberEvent", actor: feedActor, payload: { action: "added", member: { login: "friend" } } } },
  { name: "wiki page", webhook: ["gollum", { pages: [{ title: "Home", action: "edited", sha: "w1", html_url: "u" }], sender: me }], feed: { type: "GollumEvent", actor: feedActor, payload: { pages: [{ title: "Home", action: "edited", sha: "w1", html_url: "u" }] } } },
  { name: "made public", webhook: ["public", { sender: me }], feed: { type: "PublicEvent", actor: feedActor, payload: {} } },
  { name: "discussion created", webhook: ["discussion", { action: "created", discussion: { number: 5, title: "Idea", html_url: "u", created_at: WHEN }, sender: me }], feed: { type: "DiscussionEvent", actor: feedActor, payload: { action: "created", discussion: { number: 5, title: "Idea", html_url: "u" } } } },
  { name: "discussion answered", webhook: ["discussion", { action: "answered", discussion: { number: 5, title: "Idea", html_url: "u", created_at: WHEN }, sender: me }], feed: { type: "DiscussionEvent", actor: feedActor, payload: { action: "answered", discussion: { number: 5, title: "Idea", html_url: "u" } } } },
];

const keys = (events: { kind: string; dedupe_key: string | null }[]) => events.map((e) => `${e.kind} ${e.dedupe_key}`).sort();

describe("poll path (repo events feed) against the webhook", () => {
  it.each(cases)("$name: same kind and dedupe_key", async ({ webhook, feed, counts }) => {
    const [eventName, payload] = webhook;
    const fromWebhook = await normalizeWebhookEvent(eventName, { repository, ...payload }, SETTINGS);
    const fromFeed = await normalizeEventsApiResponse(
      [{ id: "1", repo: { name: REPO }, public: true, created_at: WHEN, ...feed }],
      SETTINGS
    );

    if (counts === false) {
      expect(fromWebhook).toEqual([]);
      expect(fromFeed).toEqual([]);
      return;
    }
    expect(fromWebhook.length).toBeGreaterThan(0);
    expect(keys(fromFeed)).toEqual(keys(fromWebhook));
  });
});

// REST answers for one repo, by path
let rest: Record<string, unknown>;
// octokit's search throttle remembers the last call across tests, so the frozen clock only moves forward
let clock = new Date("2026-03-10T15:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock += 60_000;
  vi.setSystemTime(clock);
  process.env.GITHUB_EVENTS_TOKEN = "pat";
  rest = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const found = rest[url.pathname];
      if (found === undefined) throw new Error(`Unexpected fetch ${url}`);
      if (url.pathname === "/search/issues") vi.setSystemTime(Date.now() + 5000); // octokit spaces search calls by Date.now()
      const res = Response.json(found);
      Object.defineProperty(res, "url", { value: String(url) });
      return res;
    })
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const site = { id: 1, full_name: REPO, owner: "Staxed", name: "site", visibility: "public" as const };

describe("backfill path (REST listings) against the webhook", () => {
  it("stores the same kind and dedupe_key the webhook does, for every type with a listing", async () => {
    const wh = (name: string) => cases.find((c) => c.name === name)!.webhook;
    const expectedFrom = async (...names: string[]) => {
      const events = [];
      for (const name of names) {
        const [eventName, payload] = wh(name);
        events.push(...(await normalizeWebhookEvent(eventName, { repository, ...payload }, SETTINGS)));
      }
      return keys(events);
    };

    rest[`/repos/${REPO}/issues`] = [
      { ...issue(3), state: "closed", created_at: WHEN, closed_at: WHEN },
      { ...issue(50), state: "open", created_at: WHEN, pull_request: {} }, // a PR in the issues listing
    ];
    rest[`/repos/${REPO}/issues/comments`] = [
      { ...comment(21), issue_url: `https://api.github.com/repos/${REPO}/issues/3` },
      { ...comment(22, { user: other }), issue_url: `https://api.github.com/repos/${REPO}/issues/3` },
    ];
    rest[`/repos/${REPO}/pulls/comments`] = [{ ...comment(31), pull_request_url: `https://api.github.com/repos/${REPO}/pulls/7` }];
    rest[`/repos/${REPO}/comments`] = [comment(41, { commit_id: "abcdef123456" })];
    rest["/search/issues"] = { total_count: 1, incomplete_results: false, items: [{ number: 7 }] };
    rest[`/repos/${REPO}/pulls/7/reviews`] = [{ ...review, state: "APPROVED" }, { ...review, id: 12, user: other }, { ...review, id: 13, submitted_at: null, state: "PENDING" }];
    rest[`/repos/${REPO}/releases`] = [release, { ...release, tag_name: "v2-draft", draft: true, published_at: null }];
    rest[`/repos/${REPO}/forks`] = [{ ...forkee, owner: me }, { ...forkee, full_name: "someone/site", owner: other }];
    rest[`/repos/${REPO}/stargazers`] = [{ starred_at: WHEN, user: me }, { starred_at: WHEN, user: other }];
    rest[`/repos/${REPO}/events`] = [
      { id: "1", type: "CreateEvent", actor: me, repo: { name: REPO }, public: true, created_at: WHEN, payload: { ref_type: "branch", ref: "feat/x" } },
      { id: "2", type: "DeleteEvent", actor: me, repo: { name: REPO }, public: true, created_at: WHEN, payload: { ref_type: "tag", ref: "v1" } },
      { id: "3", type: "CreateEvent", actor: other, repo: { name: REPO }, public: true, created_at: WHEN, payload: { ref_type: "branch", ref: "theirs" } },
      { id: "4", type: "MemberEvent", actor: me, repo: { name: REPO }, public: true, created_at: WHEN, payload: { action: "added", member: { login: "friend" } } },
      { id: "5", type: "GollumEvent", actor: me, repo: { name: REPO }, public: true, created_at: WHEN, payload: { pages: [{ title: "Home", action: "edited", sha: "w1", html_url: "u" }] } },
      { id: "6", type: "PublicEvent", actor: me, repo: { name: REPO }, public: true, created_at: WHEN, payload: {} },
      { id: "7", type: "DiscussionEvent", actor: me, repo: { name: REPO }, public: true, created_at: WHEN, payload: { action: "created", discussion: { number: 5, title: "Idea", html_url: "u" } } },
      { id: "8", type: "PullRequestEvent", actor: me, repo: { name: REPO }, public: true, created_at: WHEN, payload: { action: "opened", number: 7 } }, // not the feed's job here
    ];

    const store = createMemoryStore();
    const result = await backfillRepoActivity(site, SINCE, store);

    expect(result.errors).toEqual([]);
    expect(keys(store.events)).toEqual(
      await expectedFrom(
        "issue opened", "issue closed", "issue comment", "pr review comment", "commit comment", "review", "release", "fork", "star",
        "branch created", "tag deleted", "member added", "wiki page", "made public", "discussion created"
      )
    );
    expect(store.events.every((e) => e.posted_to_discord === true)).toBe(true);
    expect(result.inserted).toBe(store.events.length);
  });

  it("stores a default-branch commit under the webhook's key and a PR under the same key a webhook PR has", async () => {
    rest[`/repos/${REPO}/commits`] = [{ sha: "c1", html_url: "u", commit: { message: "Add", author: { date: WHEN } } }];
    rest["/search/issues"] = {
      total_count: 1, incomplete_results: false,
      items: [{ number: 7, title: "PR 7", state: "open", html_url: "u", repository_url: `https://api.github.com/repos/${REPO}`, created_at: WHEN, updated_at: WHEN, pull_request: {} }],
    };
    const store = createMemoryStore();
    await backfillRepoCommits(site, SINCE, store);
    await backfillRepoPRs(site, SINCE, store);

    const [commitWebhook, prWebhook] = ["commit", "pr opened"].map((n) => cases.find((c) => c.name === n)!.webhook);
    const fromWebhook = [
      ...(await normalizeWebhookEvent(commitWebhook[0], { repository, ...commitWebhook[1] }, SETTINGS)),
      ...(await normalizeWebhookEvent(prWebhook[0], { repository, ...prWebhook[1] }, SETTINGS)),
    ];
    expect(keys(store.events)).toEqual(keys(fromWebhook));
  });
});
