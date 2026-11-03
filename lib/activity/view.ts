import type { ActivityEvent } from "@/lib/supabase/types";

const PRIVATE_SITE_TITLE = "Activity in a private repository";

export interface DiscordPostItem {
  occurred_at: string;
  text: string;
}

export interface TimelineRow {
  occurred_on: string;
  occurred_at: string;
  title: string;
  url: string | null;
  event: ActivityEvent | null;
}

export interface RepoBreakdownRow {
  name: string;
  events: number;
}

/** Public-safe copy of an event: private events lose url and metadata. */
export function scrubPrivateEvent(event: ActivityEvent): ActivityEvent {
  if (event.visibility !== "private") return event;
  return { ...event, url: null, metadata: {}, title: event.public_summary || PRIVATE_SITE_TITLE };
}

function repoOf(event: ActivityEvent): string {
  return (event.metadata?.repo as string) || "";
}

function globToRegExp(pattern: string): RegExp {
  const source = pattern
    .trim()
    .split("")
    .map((ch) => (ch === "*" ? ".*" : ch === "?" ? "." : ch.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${source}$`, "i");
}

function excludedMatcher(patterns: string[]): (event: ActivityEvent) => boolean {
  const matchers = patterns.filter((p) => p.trim()).map(globToRegExp);
  return (event) => {
    const repo = repoOf(event);
    return repo !== "" && matchers.some((m) => m.test(repo));
  };
}

function redactedLine(events: ActivityEvent[]): string {
  const repos = new Set(events.map(repoOf));
  return `Active in ${repos.size} redacted repos · ${events.length} events`;
}

export function discordText(event: ActivityEvent): string {
  const title = event.title || "Activity";
  if (event.visibility === "private") return `${title} [Private Repo]`;
  const repo = repoOf(event);
  if (event.url) return `[${title}](${event.url}) in ${repo}`;
  return `${title}${repo ? ` in ${repo}` : ""}`;
}

/** One item per visible event, then a single line collapsing the excluded ones. */
export function discordPostItems(events: ActivityEvent[], patterns: string[]): DiscordPostItem[] {
  const isExcluded = excludedMatcher(patterns);
  const excluded = events.filter(isExcluded);
  const items = events
    .filter((e) => !isExcluded(e))
    .map((e) => ({ occurred_at: e.occurred_at, text: discordText(e) }));
  if (excluded.length > 0) {
    const newest = excluded.map((e) => e.occurred_at).sort().reverse()[0];
    items.push({ occurred_at: newest, text: redactedLine(excluded) });
  }
  return items;
}

/** Site rows, newest first: private events scrubbed, one redacted line per day. */
export function timelineRows(events: ActivityEvent[], patterns: string[]): TimelineRow[] {
  const isExcluded = excludedMatcher(patterns);
  const excludedByDay = new Map<string, ActivityEvent[]>();
  const rows: TimelineRow[] = [];

  for (const event of events) {
    if (isExcluded(event)) {
      excludedByDay.set(event.occurred_on, [...(excludedByDay.get(event.occurred_on) ?? []), event]);
    } else if (event.visibility === "private") {
      const scrubbed = scrubPrivateEvent(event);
      rows.push({
        occurred_on: event.occurred_on,
        occurred_at: event.occurred_at,
        title: scrubbed.title,
        url: null,
        event: scrubbed,
      });
    } else {
      rows.push({
        occurred_on: event.occurred_on,
        occurred_at: event.occurred_at,
        title: event.title || "Activity",
        url: event.url,
        event,
      });
    }
  }

  for (const [day, dayEvents] of excludedByDay) {
    const newest = dayEvents.map((e) => e.occurred_at).sort().reverse()[0];
    rows.push({ occurred_on: day, occurred_at: newest, title: redactedLine(dayEvents), url: null, event: null });
  }

  return rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

/** Events per repo, busiest first; excluded repos lump into one "Redacted repos" row, private repos keep names. */
export function reposBreakdown(events: ActivityEvent[], patterns: string[]): RepoBreakdownRow[] {
  const isExcluded = excludedMatcher(patterns);
  const counts = new Map<string, number>();
  let redacted = 0;
  for (const event of events) {
    if (isExcluded(event)) {
      redacted++;
      continue;
    }
    const repo = repoOf(event);
    if (repo) counts.set(repo, (counts.get(repo) ?? 0) + 1);
  }
  const rows = [...counts].map(([name, n]) => ({ name, events: n }));
  if (redacted > 0) rows.push({ name: "Redacted repos", events: redacted });
  return rows.sort((a, b) => b.events - a.events);
}
