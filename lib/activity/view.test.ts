import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@/lib/supabase/types";
import { discordPostItems, timelineRows } from "./view";

let nextId = 1;
function ev(repo: string, over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: nextId++,
    occurred_at: "2026-01-05T15:00:00Z",
    occurred_on: "2026-01-05",
    source: "github",
    category: "code",
    kind: "commit_pushed",
    value: 1,
    unit: "count",
    title: `commit in ${repo}`,
    public_summary: `Pushed to ${repo}`,
    visibility: "public",
    repo_visibility: "public",
    repo_hash: null,
    url: `https://github.com/${repo}/commit/abc`,
    metadata: { repo },
    dedupe_key: null,
    created_at: "2026-01-05T15:00:00Z",
    ...over,
  };
}
const priv = (repo: string, over: Partial<ActivityEvent> = {}) =>
  ev(repo, { visibility: "private", repo_visibility: "private", public_summary: "Activity in a private repository", ...over });

describe("private reading", () => {
  it("reads title plus [Private Repo] on Discord with no repo name or link", () => {
    const [item] = discordPostItems([priv("me/secret", { title: "fix bug", url: "https://x/secret" })], []);
    expect(item.text).toBe("fix bug [Private Repo]");
  });

  it("reads 'Activity in a private repository' on the site with url and metadata scrubbed", () => {
    const [row] = timelineRows([priv("me/secret", { title: "fix bug", url: "https://x/secret" })], []);
    expect(row.title).toBe("Activity in a private repository");
    expect(row.url).toBeNull();
    expect(row.event?.metadata).toEqual({});
  });
});

describe("collapse", () => {
  const events = [ev("me/open"), ev("me/hidden-a"), ev("me/hidden-a"), ev("me/hidden-b"), priv("me/secret")];
  const patterns = ["me/hidden-*"];

  it("collapses excluded events into one line per Discord post", () => {
    const texts = discordPostItems(events, patterns).map((i) => i.text);
    expect(texts).toHaveLength(3);
    expect(texts).toContain("Active in 2 redacted repos · 3 events");
    expect(texts.join("\n")).not.toContain("hidden");
  });

  it("collapses excluded events into one line per day on the timeline", () => {
    const other = ev("me/hidden-a", { occurred_on: "2026-01-06", occurred_at: "2026-01-06T10:00:00Z" });
    const titles = timelineRows([...events, other], patterns).map((r) => r.title);
    expect(titles).toContain("Active in 2 redacted repos · 3 events");
    expect(titles).toContain("Active in 1 redacted repos · 1 events");
  });

  it("excluded wins over private", () => {
    const texts = discordPostItems([priv("me/hidden-a")], patterns).map((i) => i.text);
    expect(texts).toEqual(["Active in 1 redacted repos · 1 events"]);
  });
});

describe("patterns", () => {
  it("matches full names case-insensitively", () => {
    const items = discordPostItems([ev("Me/Hidden")], ["me/hidden"]);
    expect(items[0].text).toBe("Active in 1 redacted repos · 1 events");
  });

  it("supports * and ? globs and leaves non-matches untouched", () => {
    const out = discordPostItems([ev("org/a1"), ev("org/ab1"), ev("other/a1")], ["org/a?", "nomatch/*"]);
    expect(out.map((i) => i.text)).toEqual([
      "[commit in org/ab1](https://github.com/org/ab1/commit/abc) in org/ab1",
      "[commit in other/a1](https://github.com/other/a1/commit/abc) in other/a1",
      "Active in 1 redacted repos · 1 events",
    ]);
  });

  it("treats regex characters literally and matches the whole name", () => {
    const out = discordPostItems([ev("me/a.b"), ev("me/axb"), ev("me/a.b-extra")], ["me/a.b"]);
    expect(out).toHaveLength(3);
    expect(out.filter((i) => i.text.startsWith("Active in 1 redacted")).length).toBe(1);
  });
});
});

describe("ordering and redacted timestamps", () => {
  const patterns = ["me/hidden"];
  const old = ev("me/open", { title: "old", occurred_at: "2026-01-05T08:00:00Z" });
  const mid = ev("me/hidden", { occurred_at: "2026-01-05T09:00:00Z" });
  const newest = ev("me/hidden", { occurred_at: "2026-01-05T12:00:00Z" });
  const newer = ev("me/open", { title: "newer", occurred_at: "2026-01-05T10:00:00Z" });

  it("lists timeline rows newest first and stamps the redacted row with the newest excluded event", () => {
    const rows = timelineRows([old, mid, newest, newer], patterns);
    expect(rows.map((r) => r.occurred_at)).toEqual([
      "2026-01-05T12:00:00Z",
      "2026-01-05T10:00:00Z",
      "2026-01-05T08:00:00Z",
    ]);
    expect(rows[0].title).toBe("Active in 1 redacted repos · 2 events");
  });

  it("stamps the Discord redacted item with the newest excluded event", () => {
    const items = discordPostItems([mid, newest], patterns);
    expect(items[0].occurred_at).toBe("2026-01-05T12:00:00Z");
  });
});
