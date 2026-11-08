import type { ActivityStore } from "@/lib/activity/store";
import type { DiscordRepo } from "@/lib/supabase/types";
import type { DiscoveredRepo } from "@/lib/github/backfill";

export interface RepoListEntry extends DiscordRepo {
  visibility: "public" | "private";
  /** Ticked, no display name, and some stored event came from a private repo. */
  needs_name: boolean;
}

const REPO_FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** The trimmed owner/repo, or null when the input is not one. */
export function parseRepoFullName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return REPO_FULL_NAME.test(trimmed) ? trimmed : null;
}

/**
 * Every repo GitHub lists, every repo in stored activity and every saved row.
 * Visibility is GitHub's flag when GitHub lists the repo, otherwise private.
 * Repos GitHub reports as archived are left out; their stored events and saved row are kept.
 */
export async function buildRepoList(store: ActivityStore, github: DiscoveredRepo[]): Promise<RepoListEntry[]> {
  const [eventRepos, saved] = await Promise.all([store.listEventRepos(), store.listDiscordRepos()]);
  const githubVisibility = new Map(github.map((r) => [r.full_name, r.visibility]));
  const savedByName = new Map(saved.map((r) => [r.repo_full_name, r]));
  const hasPrivateEvent = new Map(eventRepos.map((r) => [r.repo_full_name, r.has_private_event]));

  const archived = new Set(github.filter((r) => r.archived).map((r) => r.full_name));
  const names = new Set([...githubVisibility.keys(), ...hasPrivateEvent.keys(), ...savedByName.keys()]);
  return [...names].filter((name) => !archived.has(name)).sort().map((repo_full_name) => {
    const row = savedByName.get(repo_full_name);
    const display_name = row?.display_name ?? null;
    const included = row?.included ?? false;
    return {
      repo_full_name,
      display_name,
      included,
      visibility: githubVisibility.get(repo_full_name) ?? "private",
      needs_name: included && !display_name && (hasPrivateEvent.get(repo_full_name) ?? false),
    };
  });
}

/** The rows a save must write: only changed ones, or an error naming the first private repo ticked without a name. */
export function planRepoSave(list: RepoListEntry[], submitted: unknown): { rows: DiscordRepo[] } | { error: string } {
  if (!Array.isArray(submitted)) return { error: "repos must be a list" };
  const current = new Map(list.map((r) => [r.repo_full_name, r]));
  const rows: DiscordRepo[] = [];

  for (const item of submitted) {
    const repo_full_name = parseRepoFullName(item?.repo_full_name);
    if (!repo_full_name || typeof item.included !== "boolean") {
      return { error: "each repo needs an owner/repo name and an included flag" };
    }
    const display_name = typeof item.display_name === "string" ? item.display_name.trim() || null : null;
    const before = current.get(repo_full_name);
    if (before && before.included === item.included && before.display_name === display_name) continue;
    if (!before && !item.included && !display_name) continue;

    const visibility = before?.visibility ?? "private";
    if (item.included && visibility === "private" && !display_name) {
      return { error: `${repo_full_name} is private: give it a display name before ticking it` };
    }
    rows.push({ repo_full_name, display_name, included: item.included });
  }
  return { rows };
}
