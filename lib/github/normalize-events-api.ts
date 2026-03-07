/**
 * Adapter to normalize GitHub Events API responses to the same format
 * as activity_events rows. The Events API returns a different structure
 * than webhook payloads, so we translate here.
 *
 * Reference: https://docs.github.com/en/rest/activity/events
 */

import { sanitizeForPrivateRepo, hashRepoName } from "./sanitize";
import { toDateInTimezone } from "@/lib/dates";

interface NormalizedEvent {
  occurred_at: string;
  occurred_on: string;
  source: "github";
  category: string;
  kind: string;
  value: number;
  unit: string;
  title: string | null;
  public_summary: string | null;
  visibility: "public" | "private";
  repo_visibility: "public" | "private";
  repo_hash: string;
  url: string | null;
  metadata: Record<string, unknown>;
  dedupe_key: string;
}

interface GitHubEvent {
  id: string;
  type: string;
  actor: { login: string };
  repo: { name: string };
  payload: Record<string, unknown>;
  public: boolean;
  created_at: string;
}

export function normalizeEventsApiResponse(
  events: GitHubEvent[],
  settings: { github_username: string; timezone: string }
): NormalizedEvent[] {
  const result: NormalizedEvent[] = [];
  const GITHUB_USERNAME = settings.github_username;
  const TIMEZONE = settings.timezone;

  for (const event of events) {
    // Only process events by the configured user
    if (event.actor.login.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) continue;

    const repoFullName = event.repo.name;
    const isPrivateRepo = !event.public;
    const repoVis: "public" | "private" = isPrivateRepo ? "private" : "public";
    const repoHash = hashRepoName(repoFullName);
    const timestamp = event.created_at;
    const occurredOn = toDateInTimezone(timestamp, TIMEZONE);

    const base = {
      occurred_at: timestamp,
      occurred_on: occurredOn,
      source: "github" as const,
      category: "code",
      repo_visibility: repoVis,
      repo_hash: repoHash,
      value: 1,
      unit: "count",
    };

    function makeEvent(
      kind: string,
      title: string,
      publicSummary: string,
      url: string | null,
      dedupeKey: string,
      metadata: Record<string, unknown>
    ): NormalizedEvent {
      const ev = {
        ...base,
        kind,
        metadata: { ...metadata, repo: repoFullName },
        dedupe_key: dedupeKey,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title,
          url,
          repo_full_name: repoFullName,
        });
        return { ...ev, title: sanitized.title, public_summary: sanitized.public_summary, url: sanitized.url, visibility: "private" };
      }
      return { ...ev, title, public_summary: publicSummary, url, visibility: "public" };
    }

    const payload = event.payload;

    switch (event.type) {
      case "PushEvent": {
        const commits = (payload.commits as Array<Record<string, unknown>>) || [];
        for (const commit of commits) {
          // Skip non-distinct commits (brought in by merges, not authored by pusher)
          if (commit.distinct === false) continue;

          const authorName = (commit.author as Record<string, unknown>)?.name as string || "";
          const authorEmail = ((commit.author as Record<string, unknown>)?.email as string) || "";

          // Filter by author: match GitHub username in noreply email or author name
          const lowerUser = GITHUB_USERNAME.toLowerCase();
          const emailMatch = authorEmail.toLowerCase().includes(lowerUser);
          const nameMatch = authorName.toLowerCase() === lowerUser;
          if (!emailMatch && !nameMatch) continue;

          const sha = commit.sha as string;
          const message = ((commit.message as string) || "").split("\n")[0];

          result.push(makeEvent(
            "commit_pushed",
            message,
            `Pushed to ${repoFullName}`,
            event.public ? `https://github.com/${repoFullName}/commit/${sha}` : null,
            `commit:${repoFullName}:${sha}`,
            { sha, author_name: authorName }
          ));
        }
        break;
      }

      case "PullRequestEvent": {
        const action = payload.action as string;
        const pr = payload.pull_request as Record<string, unknown>;
        if (!pr) break;

        const merged = pr.merged as boolean;
        let kind: string;
        if (action === "opened") kind = "pr_opened";
        else if (action === "closed" && merged) kind = "pr_merged";
        else if (action === "closed") kind = "pr_closed";
        else break;

        const prNumber = payload.number as number || pr.number as number;
        const prTitle = pr.title as string;
        const prUrl = pr.html_url as string;
        const actionLabel = kind === "pr_merged" ? "Merged" : kind === "pr_opened" ? "Opened" : "Closed";

        result.push(makeEvent(
          kind,
          `${actionLabel} PR #${prNumber}: ${prTitle}`,
          `${actionLabel} PR in ${repoFullName}`,
          prUrl,
          `pr:${repoFullName}:${prNumber}:${kind}`,
          { pr_number: prNumber }
        ));
        break;
      }

      case "IssuesEvent": {
        const action = payload.action as string;
        if (action !== "opened" && action !== "closed") break;

        const issue = payload.issue as Record<string, unknown>;
        if (!issue) break;

        const kind = action === "opened" ? "issue_opened" : "issue_closed";
        const issueNumber = issue.number as number;
        const issueTitle = issue.title as string;
        const issueUrl = issue.html_url as string;

        result.push(makeEvent(
          kind,
          `${action === "opened" ? "Opened" : "Closed"} issue #${issueNumber}: ${issueTitle}`,
          `${action === "opened" ? "Opened" : "Closed"} issue in ${repoFullName}`,
          issueUrl,
          `issue:${repoFullName}:${issueNumber}:${kind}`,
          { issue_number: issueNumber }
        ));
        break;
      }

      case "ReleaseEvent": {
        const action = payload.action as string;
        if (action !== "published") break;

        const release = payload.release as Record<string, unknown>;
        if (!release) break;

        const tagName = release.tag_name as string;
        const releaseName = (release.name as string) || tagName;
        const releaseUrl = release.html_url as string;

        result.push(makeEvent(
          "release_published",
          `Released ${releaseName} in ${repoFullName}`,
          `Published release ${tagName} in ${repoFullName}`,
          releaseUrl,
          `release:${repoFullName}:${tagName}`,
          { tag: tagName }
        ));
        break;
      }

      case "PullRequestReviewEvent": {
        const review = payload.review as Record<string, unknown>;
        if (!review) break;

        const prPayload = payload.pull_request as Record<string, unknown>;
        const prNumber = prPayload?.number as number;
        const reviewId = review.id as number;
        const state = review.state as string;
        const reviewUrl = review.html_url as string;

        result.push(makeEvent(
          "review_submitted",
          `Reviewed PR #${prNumber} (${state}) in ${repoFullName}`,
          `Reviewed PR in ${repoFullName}`,
          reviewUrl,
          `review:${repoFullName}:${prNumber}:${reviewId}`,
          { pr_number: prNumber, review_id: reviewId, state }
        ));
        break;
      }

      case "CreateEvent": {
        const refType = payload.ref_type as string;
        const ref = payload.ref as string;
        // Skip repository creation events (ref is null, not a branch or tag)
        if (refType === "repository") break;
        const kind = refType === "tag" ? "tag_created" : "branch_created";

        result.push(makeEvent(
          kind,
          `Created ${refType} ${ref} in ${repoFullName}`,
          `Created ${refType} in ${repoFullName}`,
          null,
          `create:${repoFullName}:${refType}:${ref}`,
          { ref_type: refType, ref }
        ));
        break;
      }

      case "DeleteEvent": {
        const refType = payload.ref_type as string;
        const ref = payload.ref as string;
        const kind = refType === "tag" ? "tag_deleted" : "branch_deleted";

        result.push(makeEvent(
          kind,
          `Deleted ${refType} ${ref} in ${repoFullName}`,
          `Deleted ${refType} in ${repoFullName}`,
          null,
          `delete:${repoFullName}:${refType}:${ref}`,
          { ref_type: refType, ref }
        ));
        break;
      }

      case "ForkEvent": {
        const forkee = payload.forkee as Record<string, unknown>;
        if (!forkee) break;

        const forkFullName = forkee.full_name as string;
        const forkUrl = forkee.html_url as string;

        result.push(makeEvent(
          "repo_forked",
          `Forked ${repoFullName} to ${forkFullName}`,
          `Forked ${repoFullName}`,
          forkUrl,
          `fork:${repoFullName}:${forkFullName}`,
          { fork_full_name: forkFullName }
        ));
        break;
      }

      case "WatchEvent": {
        result.push(makeEvent(
          "repo_starred",
          `Starred ${repoFullName}`,
          `Starred ${repoFullName}`,
          `https://github.com/${repoFullName}`,
          `star:${repoFullName}:${event.actor.login}`,
          {}
        ));
        break;
      }

      case "IssueCommentEvent": {
        const action = payload.action as string;
        if (action !== "created") break;

        const comment = payload.comment as Record<string, unknown>;
        const issue = payload.issue as Record<string, unknown>;
        if (!comment || !issue) break;

        const commentId = comment.id as number;
        const commentUrl = comment.html_url as string;
        const commentBody = ((comment.body as string) || "").split("\n")[0].slice(0, 80);
        const issueNumber = issue.number as number;

        result.push(makeEvent(
          "issue_comment_created",
          `Commented on #${issueNumber}: ${commentBody}`,
          `Commented on issue in ${repoFullName}`,
          commentUrl,
          `issue_comment:${repoFullName}:${commentId}`,
          { comment_id: commentId, issue_number: issueNumber }
        ));
        break;
      }

      case "CommitCommentEvent": {
        const comment = payload.comment as Record<string, unknown>;
        if (!comment) break;

        const commentId = comment.id as number;
        const commentUrl = comment.html_url as string;
        const commentBody = ((comment.body as string) || "").split("\n")[0].slice(0, 80);
        const commitId = comment.commit_id as string;

        result.push(makeEvent(
          "commit_comment_created",
          `Commented on commit ${(commitId || "").slice(0, 7)}: ${commentBody}`,
          `Commented on commit in ${repoFullName}`,
          commentUrl,
          `commit_comment:${repoFullName}:${commentId}`,
          { comment_id: commentId, commit_id: commitId }
        ));
        break;
      }

      case "GollumEvent": {
        const pages = (payload.pages as Array<Record<string, unknown>>) || [];
        for (const page of pages) {
          const pageName = page.title as string;
          const pageAction = page.action as string;
          const pageSha = page.sha as string;
          const pageUrl = page.html_url as string;

          result.push(makeEvent(
            "wiki_updated",
            `${pageAction} wiki page "${pageName}" in ${repoFullName}`,
            `Updated wiki in ${repoFullName}`,
            pageUrl,
            `wiki:${repoFullName}:${pageSha}`,
            { page_name: pageName, page_action: pageAction, page_sha: pageSha }
          ));
        }
        break;
      }

      case "MemberEvent": {
        const action = payload.action as string;
        if (action !== "added" && action !== "removed") break;

        const member = payload.member as Record<string, unknown>;
        if (!member) break;
        const memberLogin = member.login as string;
        const kind = action === "added" ? "member_added" : "member_removed";

        result.push(makeEvent(
          kind,
          `${action === "added" ? "Added" : "Removed"} ${memberLogin} in ${repoFullName}`,
          `${action === "added" ? "Added" : "Removed"} collaborator in ${repoFullName}`,
          null,
          `member:${repoFullName}:${memberLogin}:${action}`,
          { member: memberLogin, action }
        ));
        break;
      }

      case "PublicEvent": {
        result.push(makeEvent(
          "repo_made_public",
          `Made ${repoFullName} public`,
          `Made ${repoFullName} public`,
          `https://github.com/${repoFullName}`,
          `public:${repoFullName}`,
          {}
        ));
        break;
      }

      // Skip event types we don't track (e.g., SponsorshipEvent)
      default:
        break;
    }
  }

  return result;
}
