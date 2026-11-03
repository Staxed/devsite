import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@/lib/supabase/types";
import { discordPostItems, reposBreakdown, timelineRows } from "./view";

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

  it("lumps excluded repos into one row in the repos breakdown and keeps private names", () => {
    expect(reposBreakdown(events, patterns)).toEqual([
      { name: "Redacted repos", events: 3 },
      { name: "me/open", events: 1 },
      { name: "me/secret", events: 1 },
    ]);
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

  it("changing patterns changes how the same stored events show", () => {
    const stored = [ev("me/proj")];
    expect(reposBreakdown(stored, [])).toEqual([{ name: "me/proj", events: 1 }]);
    expect(reposBreakdown(stored, ["me/*"])).toEqual([{ name: "Redacted repos", events: 1 }]);
  });
});
