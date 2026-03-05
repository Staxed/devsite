export const BASE_URL = process.env.NEXTAUTH_URL!;

// Auth (must be env — needed before DB is reachable during auth bootstrap)
export const ADMIN_WALLET_ADDRESS = process.env.ADMIN_WALLET_ADDRESS!;

// Discord post priority order (lower = higher priority)
export const DISCORD_POST_PRIORITY: Record<string, number> = {
  commit_pushed: 1,
  pr_opened: 2,
  pr_merged: 2,
  pr_closed: 2,
  issue_opened: 3,
  issue_closed: 3,
  release_published: 4,
  review_submitted: 5,
  branch_created: 6,
  tag_created: 6,
  branch_deleted: 7,
  tag_deleted: 7,
  repo_forked: 8,
  repo_starred: 9,
  issue_comment_created: 10,
  pr_comment_created: 10,
  commit_comment_created: 10,
  member_added: 11,
  member_removed: 11,
  wiki_updated: 12,
  repo_made_public: 13,
  discussion_created: 14,
  discussion_answered: 14,
};

// Event filter config — toggle which event types get posted to Discord.
// Events are always stored in the DB regardless of these settings.
export const EVENT_FILTERS: Record<string, boolean> = {
  POST_COMMITS: true,
  POST_PRS: true,
  POST_ISSUES: true,
  POST_RELEASES: true,
  POST_REVIEWS: true,
  POST_BRANCHES: true,
  POST_TAGS: true,
  POST_FORKS: true,
  POST_STARS: true,
  POST_COMMENTS: true,
  POST_MEMBERS: true,
  POST_WIKI: true,
  POST_PUBLIC: true,
  POST_DISCUSSIONS: true,
};

// PR action filter
export const PR_ACTION_FILTER = ["opened", "closed", "merged"];

// Issue action filter
export const ISSUE_ACTION_FILTER = ["opened", "closed"];

// Review state filter
export const REVIEW_STATE_FILTER = ["approved", "changes_requested"];

// Branch ignore patterns
export const BRANCH_IGNORE_PATTERNS = ["dependabot/", "renovate/"];

// Map event kinds to filter keys
const KIND_TO_FILTER: Record<string, string> = {
  commit_pushed: "POST_COMMITS",
  pr_opened: "POST_PRS",
  pr_closed: "POST_PRS",
  pr_merged: "POST_PRS",
  issue_opened: "POST_ISSUES",
  issue_closed: "POST_ISSUES",
  release_published: "POST_RELEASES",
  review_submitted: "POST_REVIEWS",
  branch_created: "POST_BRANCHES",
  branch_deleted: "POST_BRANCHES",
  tag_created: "POST_TAGS",
  tag_deleted: "POST_TAGS",
  repo_forked: "POST_FORKS",
  repo_starred: "POST_STARS",
  issue_comment_created: "POST_COMMENTS",
  pr_comment_created: "POST_COMMENTS",
  commit_comment_created: "POST_COMMENTS",
  member_added: "POST_MEMBERS",
  member_removed: "POST_MEMBERS",
  wiki_updated: "POST_WIKI",
  repo_made_public: "POST_PUBLIC",
  discussion_created: "POST_DISCUSSIONS",
  discussion_answered: "POST_DISCUSSIONS",
};

/**
 * Check if an event kind should be posted to Discord based on filter config.
 */
export function shouldPostEvent(kind: string): boolean {
  const filterKey = KIND_TO_FILTER[kind];
  if (!filterKey) return true; // Unknown kinds are posted by default
  return EVENT_FILTERS[filterKey] !== false;
}
