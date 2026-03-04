import { sanitizeForPrivateRepo, hashRepoName } from "./sanitize";

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

function toDateInTimezone(isoDate: string, tz: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
}

function isPrivate(payload: Record<string, unknown>): boolean {
  const repo = payload.repository as Record<string, unknown> | undefined;
  if (!repo) return false;
  return repo.private === true || repo.visibility === "private";
}

function getRepoFullName(payload: Record<string, unknown>): string {
  const repo = payload.repository as Record<string, unknown> | undefined;
  return (repo?.full_name as string) || "unknown/unknown";
}

function getRepoVisibility(payload: Record<string, unknown>): "public" | "private" {
  return isPrivate(payload) ? "private" : "public";
}

export function normalizeWebhookEvent(
  eventName: string,
  payload: Record<string, unknown>,
  settings: { github_username: string; timezone: string }
): NormalizedEvent[] {
  const GITHUB_USERNAME = settings.github_username;
  const TIMEZONE = settings.timezone;
  const events: NormalizedEvent[] = [];
  const repoFullName = getRepoFullName(payload);
  const repoVis = getRepoVisibility(payload);
  const isPrivateRepo = repoVis === "private";
  const repoHash = hashRepoName(repoFullName);

  switch (eventName) {
    case "push": {
      const commits = (payload.commits as Array<Record<string, unknown>>) || [];
      for (const commit of commits) {
        const author = commit.author as Record<string, unknown> | undefined;
        const authorUsername = author?.username as string | undefined;

        // Only track commits by the configured user
        if (
          authorUsername?.toLowerCase() !== GITHUB_USERNAME.toLowerCase()
        ) {
          continue;
        }

        const sha = commit.id as string;
        const message = (commit.message as string) || "";
        const subject = message.split("\n")[0];
        const timestamp = (commit.timestamp as string) || new Date().toISOString();

        const base = {
          occurred_at: timestamp,
          occurred_on: toDateInTimezone(timestamp, TIMEZONE),
          source: "github" as const,
          category: "code",
          kind: "commit_pushed",
          value: 1,
          unit: "count",
          metadata: { sha, repo: repoFullName },
          dedupe_key: `commit:${repoFullName}:${sha}`,
          repo_visibility: repoVis,
          repo_hash: repoHash,
        };

        if (isPrivateRepo) {
          const sanitized = sanitizeForPrivateRepo({
            title: subject,
            url: commit.url as string | null,
            repo_full_name: repoFullName,
          });
          events.push({
            ...base,
            title: sanitized.title,
            public_summary: sanitized.public_summary,
            url: sanitized.url,
            visibility: "private",
          });
        } else {
          events.push({
            ...base,
            title: subject,
            public_summary: `Pushed to ${repoFullName}`,
            url: (commit.url as string) || null,
            visibility: "public",
          });
        }
      }
      break;
    }

    case "pull_request": {
      const action = payload.action as string;
      const pr = payload.pull_request as Record<string, unknown>;
      if (!pr) break;

      const merged = pr.merged as boolean;
      let kind: string;
      if (action === "opened") kind = "pr_opened";
      else if (action === "closed" && merged) kind = "pr_merged";
      else if (action === "closed") kind = "pr_closed";
      else break; // skip other actions

      const prTitle = pr.title as string;
      const prNumber = pr.number as number;
      const prUrl = pr.html_url as string;
      const prUser = pr.user as Record<string, unknown> | undefined;
      const prLogin = (prUser?.login as string) || "";

      if (prLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const timestamp = (pr.updated_at as string) || new Date().toISOString();

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind,
        value: 1,
        unit: "count",
        metadata: { pr_number: prNumber, repo: repoFullName },
        dedupe_key: `pr:${repoFullName}:${prNumber}:${kind}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title: prTitle,
          url: prUrl,
          repo_full_name: repoFullName,
        });
        events.push({
          ...base,
          title: sanitized.title,
          public_summary: sanitized.public_summary,
          url: sanitized.url,
          visibility: "private",
        });
      } else {
        events.push({
          ...base,
          title: `${kind === "pr_merged" ? "Merged" : kind === "pr_opened" ? "Opened" : "Closed"} PR #${prNumber}: ${prTitle}`,
          public_summary: `${kind === "pr_merged" ? "Merged" : kind === "pr_opened" ? "Opened" : "Closed"} PR in ${repoFullName}`,
          url: prUrl,
          visibility: "public",
        });
      }
      break;
    }

    case "issues": {
      const action = payload.action as string;
      if (action !== "opened" && action !== "closed") break;

      const issue = payload.issue as Record<string, unknown>;
      if (!issue) break;

      const kind = action === "opened" ? "issue_opened" : "issue_closed";
      const issueTitle = issue.title as string;
      const issueNumber = issue.number as number;
      const issueUrl = issue.html_url as string;
      const issueUser = issue.user as Record<string, unknown> | undefined;
      const issueLogin = (issueUser?.login as string) || "";

      if (issueLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const timestamp = (issue.updated_at as string) || new Date().toISOString();

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind,
        value: 1,
        unit: "count",
        metadata: { issue_number: issueNumber, repo: repoFullName },
        dedupe_key: `issue:${repoFullName}:${issueNumber}:${kind}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title: issueTitle,
          url: issueUrl,
          repo_full_name: repoFullName,
        });
        events.push({
          ...base,
          title: sanitized.title,
          public_summary: sanitized.public_summary,
          url: sanitized.url,
          visibility: "private",
        });
      } else {
        events.push({
          ...base,
          title: `${action === "opened" ? "Opened" : "Closed"} issue #${issueNumber}: ${issueTitle}`,
          public_summary: `${action === "opened" ? "Opened" : "Closed"} issue in ${repoFullName}`,
          url: issueUrl,
          visibility: "public",
        });
      }
      break;
    }

    case "release": {
      const action = payload.action as string;
      if (action !== "published") break;

      const release = payload.release as Record<string, unknown>;
      if (!release) break;

      const tagName = release.tag_name as string;
      const releaseName = (release.name as string) || tagName;
      const releaseUrl = release.html_url as string;
      const timestamp = (release.published_at as string) || new Date().toISOString();

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind: "release_published",
        value: 1,
        unit: "count",
        metadata: { tag: tagName, repo: repoFullName },
        dedupe_key: `release:${repoFullName}:${tagName}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title: releaseName,
          url: releaseUrl,
          repo_full_name: repoFullName,
        });
        events.push({
          ...base,
          title: sanitized.title,
          public_summary: sanitized.public_summary,
          url: sanitized.url,
          visibility: "private",
        });
      } else {
        events.push({
          ...base,
          title: `Released ${releaseName} in ${repoFullName}`,
          public_summary: `Published release ${tagName} in ${repoFullName}`,
          url: releaseUrl,
          visibility: "public",
        });
      }
      break;
    }

    case "pull_request_review": {
      const action = payload.action as string;
      if (action !== "submitted") break;

      const review = payload.review as Record<string, unknown>;
      if (!review) break;

      const reviewUser = review.user as Record<string, unknown> | undefined;
      const reviewLogin = (reviewUser?.login as string) || "";
      if (reviewLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const pr = payload.pull_request as Record<string, unknown>;
      const prNumber = pr?.number as number;
      const reviewId = review.id as number;
      const state = review.state as string; // approved, changes_requested, commented
      const reviewUrl = review.html_url as string;
      const timestamp = (review.submitted_at as string) || new Date().toISOString();

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind: "review_submitted",
        value: 1,
        unit: "count",
        metadata: { pr_number: prNumber, review_id: reviewId, state, repo: repoFullName },
        dedupe_key: `review:${repoFullName}:${prNumber}:${reviewId}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title: `Reviewed PR #${prNumber} (${state})`,
          url: reviewUrl,
          repo_full_name: repoFullName,
        });
        events.push({ ...base, title: sanitized.title, public_summary: sanitized.public_summary, url: sanitized.url, visibility: "private" });
      } else {
        events.push({
          ...base,
          title: `Reviewed PR #${prNumber} (${state}) in ${repoFullName}`,
          public_summary: `Reviewed PR in ${repoFullName}`,
          url: reviewUrl,
          visibility: "public",
        });
      }
      break;
    }

    case "create": {
      const refType = payload.ref_type as string; // branch or tag
      const ref = payload.ref as string;
      const sender = payload.sender as Record<string, unknown> | undefined;
      const senderLogin = (sender?.login as string) || "";
      if (senderLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const kind = refType === "tag" ? "tag_created" : "branch_created";
      const timestamp = new Date().toISOString();

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind,
        value: 1,
        unit: "count",
        metadata: { ref_type: refType, ref, repo: repoFullName },
        dedupe_key: `create:${repoFullName}:${refType}:${ref}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title: `Created ${refType} ${ref}`,
          url: null,
          repo_full_name: repoFullName,
        });
        events.push({ ...base, title: sanitized.title, public_summary: sanitized.public_summary, url: sanitized.url, visibility: "private" });
      } else {
        events.push({
          ...base,
          title: `Created ${refType} ${ref} in ${repoFullName}`,
          public_summary: `Created ${refType} in ${repoFullName}`,
          url: null,
          visibility: "public",
        });
      }
      break;
    }

    case "delete": {
      const refType = payload.ref_type as string;
      const ref = payload.ref as string;
      const sender = payload.sender as Record<string, unknown> | undefined;
      const senderLogin = (sender?.login as string) || "";
      if (senderLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const kind = refType === "tag" ? "tag_deleted" : "branch_deleted";
      const timestamp = new Date().toISOString();

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind,
        value: 1,
        unit: "count",
        metadata: { ref_type: refType, ref, repo: repoFullName },
        dedupe_key: `delete:${repoFullName}:${refType}:${ref}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title: `Deleted ${refType} ${ref}`,
          url: null,
          repo_full_name: repoFullName,
        });
        events.push({ ...base, title: sanitized.title, public_summary: sanitized.public_summary, url: sanitized.url, visibility: "private" });
      } else {
        events.push({
          ...base,
          title: `Deleted ${refType} ${ref} in ${repoFullName}`,
          public_summary: `Deleted ${refType} in ${repoFullName}`,
          url: null,
          visibility: "public",
        });
      }
      break;
    }

    case "fork": {
      const forkee = payload.forkee as Record<string, unknown> | undefined;
      if (!forkee) break;

      const sender = payload.sender as Record<string, unknown> | undefined;
      const senderLogin = (sender?.login as string) || "";
      if (senderLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const forkFullName = forkee.full_name as string;
      const forkUrl = forkee.html_url as string;
      const timestamp = (forkee.created_at as string) || new Date().toISOString();

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind: "repo_forked",
        value: 1,
        unit: "count",
        metadata: { fork_full_name: forkFullName, repo: repoFullName },
        dedupe_key: `fork:${repoFullName}:${forkFullName}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title: `Forked repository`,
          url: forkUrl,
          repo_full_name: repoFullName,
        });
        events.push({ ...base, title: sanitized.title, public_summary: sanitized.public_summary, url: sanitized.url, visibility: "private" });
      } else {
        events.push({
          ...base,
          title: `Forked ${repoFullName} to ${forkFullName}`,
          public_summary: `Forked ${repoFullName}`,
          url: forkUrl,
          visibility: "public",
        });
      }
      break;
    }

    case "watch": {
      const action = payload.action as string;
      if (action !== "started") break;

      const sender = payload.sender as Record<string, unknown> | undefined;
      const senderLogin = (sender?.login as string) || "";
      if (senderLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const timestamp = new Date().toISOString();
      const repoUrl = (payload.repository as Record<string, unknown>)?.html_url as string;

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind: "repo_starred",
        value: 1,
        unit: "count",
        metadata: { repo: repoFullName },
        dedupe_key: `star:${repoFullName}:${senderLogin}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      events.push({
        ...base,
        title: `Starred ${repoFullName}`,
        public_summary: `Starred ${repoFullName}`,
        url: repoUrl || null,
        visibility: "public",
      });
      break;
    }

    case "issue_comment": {
      const action = payload.action as string;
      if (action !== "created") break;

      const comment = payload.comment as Record<string, unknown>;
      if (!comment) break;

      const commentUser = comment.user as Record<string, unknown> | undefined;
      const commentLogin = (commentUser?.login as string) || "";
      if (commentLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const commentId = comment.id as number;
      const commentUrl = comment.html_url as string;
      const commentBody = ((comment.body as string) || "").split("\n")[0].slice(0, 80);
      const issue = payload.issue as Record<string, unknown>;
      const issueNumber = issue?.number as number;
      const timestamp = (comment.created_at as string) || new Date().toISOString();

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind: "issue_comment_created",
        value: 1,
        unit: "count",
        metadata: { comment_id: commentId, issue_number: issueNumber, repo: repoFullName },
        dedupe_key: `issue_comment:${repoFullName}:${commentId}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title: `Commented on #${issueNumber}: ${commentBody}`,
          url: commentUrl,
          repo_full_name: repoFullName,
        });
        events.push({ ...base, title: sanitized.title, public_summary: sanitized.public_summary, url: sanitized.url, visibility: "private" });
      } else {
        events.push({
          ...base,
          title: `Commented on #${issueNumber}: ${commentBody}`,
          public_summary: `Commented on issue in ${repoFullName}`,
          url: commentUrl,
          visibility: "public",
        });
      }
      break;
    }

    case "pull_request_review_comment": {
      const action = payload.action as string;
      if (action !== "created") break;

      const comment = payload.comment as Record<string, unknown>;
      if (!comment) break;

      const commentUser = comment.user as Record<string, unknown> | undefined;
      const commentLogin = (commentUser?.login as string) || "";
      if (commentLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const commentId = comment.id as number;
      const commentUrl = comment.html_url as string;
      const commentBody = ((comment.body as string) || "").split("\n")[0].slice(0, 80);
      const pr = payload.pull_request as Record<string, unknown>;
      const prNumber = pr?.number as number;
      const timestamp = (comment.created_at as string) || new Date().toISOString();

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind: "pr_comment_created",
        value: 1,
        unit: "count",
        metadata: { comment_id: commentId, pr_number: prNumber, repo: repoFullName },
        dedupe_key: `pr_comment:${repoFullName}:${commentId}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title: `Review comment on PR #${prNumber}: ${commentBody}`,
          url: commentUrl,
          repo_full_name: repoFullName,
        });
        events.push({ ...base, title: sanitized.title, public_summary: sanitized.public_summary, url: sanitized.url, visibility: "private" });
      } else {
        events.push({
          ...base,
          title: `Review comment on PR #${prNumber}: ${commentBody}`,
          public_summary: `Commented on PR in ${repoFullName}`,
          url: commentUrl,
          visibility: "public",
        });
      }
      break;
    }

    case "commit_comment": {
      const action = payload.action as string;
      if (action !== "created") break;

      const comment = payload.comment as Record<string, unknown>;
      if (!comment) break;

      const commentUser = comment.user as Record<string, unknown> | undefined;
      const commentLogin = (commentUser?.login as string) || "";
      if (commentLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const commentId = comment.id as number;
      const commentUrl = comment.html_url as string;
      const commentBody = ((comment.body as string) || "").split("\n")[0].slice(0, 80);
      const commitId = comment.commit_id as string;
      const timestamp = (comment.created_at as string) || new Date().toISOString();

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind: "commit_comment_created",
        value: 1,
        unit: "count",
        metadata: { comment_id: commentId, commit_id: commitId, repo: repoFullName },
        dedupe_key: `commit_comment:${repoFullName}:${commentId}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title: `Commented on commit: ${commentBody}`,
          url: commentUrl,
          repo_full_name: repoFullName,
        });
        events.push({ ...base, title: sanitized.title, public_summary: sanitized.public_summary, url: sanitized.url, visibility: "private" });
      } else {
        events.push({
          ...base,
          title: `Commented on commit ${commitId.slice(0, 7)}: ${commentBody}`,
          public_summary: `Commented on commit in ${repoFullName}`,
          url: commentUrl,
          visibility: "public",
        });
      }
      break;
    }

    case "member": {
      const action = payload.action as string;
      if (action !== "added" && action !== "removed") break;

      const sender = payload.sender as Record<string, unknown> | undefined;
      const senderLogin = (sender?.login as string) || "";
      if (senderLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const member = payload.member as Record<string, unknown>;
      if (!member) break;

      const memberLogin = member.login as string;
      const kind = action === "added" ? "member_added" : "member_removed";
      const timestamp = new Date().toISOString();

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind,
        value: 1,
        unit: "count",
        metadata: { member: memberLogin, action, repo: repoFullName },
        dedupe_key: `member:${repoFullName}:${memberLogin}:${action}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title: `${action === "added" ? "Added" : "Removed"} ${memberLogin}`,
          url: null,
          repo_full_name: repoFullName,
        });
        events.push({ ...base, title: sanitized.title, public_summary: sanitized.public_summary, url: sanitized.url, visibility: "private" });
      } else {
        events.push({
          ...base,
          title: `${action === "added" ? "Added" : "Removed"} ${memberLogin} in ${repoFullName}`,
          public_summary: `${action === "added" ? "Added" : "Removed"} collaborator in ${repoFullName}`,
          url: null,
          visibility: "public",
        });
      }
      break;
    }

    case "gollum": {
      const pages = (payload.pages as Array<Record<string, unknown>>) || [];
      const sender = payload.sender as Record<string, unknown> | undefined;
      const senderLogin = (sender?.login as string) || "";
      if (senderLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      for (const page of pages) {
        const pageName = page.title as string;
        const pageAction = page.action as string; // created or edited
        const pageSha = page.sha as string;
        const pageUrl = page.html_url as string;
        const timestamp = new Date().toISOString();

        const base = {
          occurred_at: timestamp,
          occurred_on: toDateInTimezone(timestamp, TIMEZONE),
          source: "github" as const,
          category: "code",
          kind: "wiki_updated",
          value: 1,
          unit: "count",
          metadata: { page_name: pageName, page_action: pageAction, page_sha: pageSha, repo: repoFullName },
          dedupe_key: `wiki:${repoFullName}:${pageSha}`,
          repo_visibility: repoVis,
          repo_hash: repoHash,
        };

        if (isPrivateRepo) {
          const sanitized = sanitizeForPrivateRepo({
            title: `${pageAction} wiki page "${pageName}"`,
            url: pageUrl,
            repo_full_name: repoFullName,
          });
          events.push({ ...base, title: sanitized.title, public_summary: sanitized.public_summary, url: sanitized.url, visibility: "private" });
        } else {
          events.push({
            ...base,
            title: `${pageAction} wiki page "${pageName}" in ${repoFullName}`,
            public_summary: `Updated wiki in ${repoFullName}`,
            url: pageUrl,
            visibility: "public",
          });
        }
      }
      break;
    }

    case "public": {
      const sender = payload.sender as Record<string, unknown> | undefined;
      const senderLogin = (sender?.login as string) || "";
      if (senderLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const repoUrl = (payload.repository as Record<string, unknown>)?.html_url as string;
      const timestamp = new Date().toISOString();

      events.push({
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind: "repo_made_public",
        value: 1,
        unit: "count",
        title: `Made ${repoFullName} public`,
        public_summary: `Made ${repoFullName} public`,
        url: repoUrl || null,
        visibility: "public",
        metadata: { repo: repoFullName },
        dedupe_key: `public:${repoFullName}`,
        repo_visibility: "public",
        repo_hash: repoHash,
      });
      break;
    }

    case "discussion": {
      const action = payload.action as string;
      if (action !== "created" && action !== "answered") break;

      const discussion = payload.discussion as Record<string, unknown>;
      if (!discussion) break;

      const sender = payload.sender as Record<string, unknown> | undefined;
      const senderLogin = (sender?.login as string) || "";
      if (senderLogin.toLowerCase() !== GITHUB_USERNAME.toLowerCase()) break;

      const discussionNum = discussion.number as number;
      const discussionTitle = discussion.title as string;
      const discussionUrl = discussion.html_url as string;
      const kind = action === "created" ? "discussion_created" : "discussion_answered";
      const timestamp = (discussion.created_at as string) || new Date().toISOString();

      const base = {
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind,
        value: 1,
        unit: "count",
        metadata: { discussion_number: discussionNum, repo: repoFullName },
        dedupe_key: `discussion:${repoFullName}:${discussionNum}:${action}`,
        repo_visibility: repoVis,
        repo_hash: repoHash,
      };

      if (isPrivateRepo) {
        const sanitized = sanitizeForPrivateRepo({
          title: `${action === "created" ? "Created" : "Answered"} discussion #${discussionNum}: ${discussionTitle}`,
          url: discussionUrl,
          repo_full_name: repoFullName,
        });
        events.push({ ...base, title: sanitized.title, public_summary: sanitized.public_summary, url: sanitized.url, visibility: "private" });
      } else {
        events.push({
          ...base,
          title: `${action === "created" ? "Created" : "Answered"} discussion #${discussionNum}: ${discussionTitle}`,
          public_summary: `${action === "created" ? "Created" : "Answered"} discussion in ${repoFullName}`,
          url: discussionUrl,
          visibility: "public",
        });
      }
      break;
    }
  }

  return events;
}
