/**
 * Line counts for Staxed's own commits, read from GitHub's GET commit when the commit is first stored.
 * Callers store the events first: a failed or slow lookup leaves lines_added and lines_removed empty
 * and never loses the event.
 */

import { Octokit } from "octokit";
import type { ActivityStore, NewEvent } from "@/lib/activity/store";

const LOOKUP_TIMEOUT_MS = 10_000;

/** The commit_pushed events whose dedupe key is not stored yet; call before storing the batch. */
export async function findNewCommits(store: ActivityStore, events: NewEvent[]): Promise<NewEvent[]> {
  const commits = events.filter((event) => event.kind === "commit_pushed");
  const stored = new Set(await store.findStoredKeys(commits.map((event) => event.dedupe_key)));
  return commits.filter((event) => !stored.has(event.dedupe_key));
}

/** Write lines_added and lines_removed for these stored commits; merge commits and failed lookups stay empty. */
export async function recordCommitLines(store: ActivityStore, commits: NewEvent[]): Promise<void> {
  if (commits.length === 0) return;
  const token = process.env.GITHUB_EVENTS_TOKEN;
  if (!token) {
    console.error("GITHUB_EVENTS_TOKEN is not set; commit line counts were not looked up");
    return;
  }
  const octokit = new Octokit({ auth: token });

  await Promise.all(
    commits.map(async (event) => {
      const [owner, repo] = String(event.metadata.repo).split("/");
      const sha = String(event.metadata.sha);
      try {
        const { data } = await octokit.rest.repos.getCommit({
          owner,
          repo,
          ref: sha,
          request: { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
        });
        if (data.parents.length >= 2) return;
        const stats = data.stats;
        if (stats?.additions === undefined || stats.deletions === undefined) {
          throw new Error("response has no stats");
        }
        await store.setEventLines(event.dedupe_key, stats.additions, stats.deletions);
      } catch (err) {
        console.error(`Line count lookup failed for ${event.metadata.repo}@${sha}:`, err);
      }
    })
  );
}
