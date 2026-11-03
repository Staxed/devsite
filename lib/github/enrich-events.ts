/**
 * GitHub's Events API no longer lists commits in push events and slims the
 * pull request and issue payloads to ids. This fills those fields from the REST
 * API so the normalizer sees the shape it expects.
 */

import type { Octokit } from "octokit";

export interface RawGitHubEvent {
  id: string;
  type: string;
  actor: { login: string };
  repo: { name: string };
  payload: Record<string, unknown>;
  public: boolean;
  created_at: string;
}

const ZERO_SHA = "0000000000000000000000000000000000000000";

interface RestCommit {
  sha: string;
  commit: { message: string; author: { name?: string; email?: string } | null };
  author: { login: string } | null;
}

function toPayloadCommit(commit: RestCommit) {
  return {
    sha: commit.sha,
    message: commit.commit.message,
    distinct: true,
    author: {
      name: commit.commit.author?.name ?? "",
      email: commit.commit.author?.email ?? "",
      login: commit.author?.login ?? "",
    },
  };
}

async function fetchPushCommits(octokit: Octokit, event: RawGitHubEvent): Promise<RestCommit[]> {
  const [owner, repo] = event.repo.name.split("/");
  const { before, head } = event.payload as { before: string; head: string };
  if (head === ZERO_SHA) return []; // branch deletion pushes no commits
  if (before === ZERO_SHA) {
    const { data } = await octokit.rest.repos.getCommit({ owner, repo, ref: head });
    return [data as unknown as RestCommit];
  }
  const { data } = await octokit.rest.repos.compareCommits({ owner, repo, base: before, head, per_page: 100 });
  return data.commits as unknown as RestCommit[];
}

async function enrichEvent(octokit: Octokit, event: RawGitHubEvent): Promise<RawGitHubEvent> {
  const [owner, repo] = event.repo.name.split("/");
  const payload = event.payload;

  switch (event.type) {
    case "PushEvent": {
      const commits = await fetchPushCommits(octokit, event);
      return { ...event, payload: { ...payload, commits: commits.map(toPayloadCommit) } };
    }
    case "PullRequestEvent": {
      const pullRequest = payload.pull_request as { number?: number } | undefined;
      const pull_number = (payload.number as number | undefined) ?? pullRequest?.number;
      if (!pull_number) return event;
      const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number });
      return { ...event, payload: { ...payload, pull_request: data } };
    }
    case "IssuesEvent": {
      const issue = payload.issue as { number?: number } | undefined;
      if (!issue?.number) return event;
      const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: issue.number });
      return { ...event, payload: { ...payload, issue: data } };
    }
    default:
      return event;
  }
}

/** A REST failure drops that event only; the rest of the poll goes on. */
export async function enrichEvents(octokit: Octokit, events: RawGitHubEvent[]): Promise<RawGitHubEvent[]> {
  const enriched: RawGitHubEvent[] = [];
  for (const event of events) {
    try {
      enriched.push(await enrichEvent(octokit, event));
    } catch (err) {
      console.error(`Skipping ${event.type} ${event.id} in ${event.repo.name}: REST lookup failed:`, err);
    }
  }
  return enriched;
}
