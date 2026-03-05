import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { createAuthenticatedOctokit } from "@/lib/github/backfill";
import { getSettings } from "@/lib/settings";
import { hashRepoName, sanitizeForPrivateRepo } from "@/lib/github/sanitize";

import { toDateInTimezone } from "@/lib/dates";

export async function POST() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { github_username: GITHUB_USERNAME, timezone: TIMEZONE } = await getSettings();
  const supabase = createAdminClient();
  const octokit = await createAuthenticatedOctokit();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get tracked repos
  const { data: repos } = await supabase
    .from("tracked_repos")
    .select("*")
    .eq("is_enabled", true);

  let totalInserted = 0;

  for (const repo of repos || []) {
    try {
      const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
        owner: repo.owner,
        repo: repo.name,
        author: GITHUB_USERNAME,
        since,
        per_page: 100,
      });

      const isPrivateRepo = repo.visibility === "private";
      const repoFullName = `${repo.owner}/${repo.name}`;
      const repoHash = hashRepoName(repoFullName);

      const events = commits.map((commit) => {
        const timestamp = commit.commit.author?.date || new Date().toISOString();
        const subject = (commit.commit.message || "").split("\n")[0];

        const base = {
          occurred_at: timestamp,
          occurred_on: toDateInTimezone(timestamp, TIMEZONE),
          source: "github" as const,
          category: "code",
          kind: "commit_pushed",
          value: 1,
          unit: "count",
          metadata: { sha: commit.sha, repo: repoFullName },
          dedupe_key: `commit:${repoFullName}:${commit.sha}`,
          repo_visibility: repo.visibility as "public" | "private",
          repo_hash: repoHash,
        };

        if (isPrivateRepo) {
          const sanitized = sanitizeForPrivateRepo({
            title: subject,
            url: commit.html_url,
            repo_full_name: repoFullName,
          });
          return { ...base, ...sanitized, visibility: "private" as const };
        }

        return {
          ...base,
          title: subject,
          public_summary: `Pushed to ${repoFullName}`,
          url: commit.html_url,
          visibility: "public" as const,
        };
      });

      if (events.length > 0) {
        const { data } = await supabase
          .from("activity_events")
          .upsert(events, { onConflict: "dedupe_key", ignoreDuplicates: true })
          .select("id");
        totalInserted += data?.length || 0;
      }
    } catch {
      // Skip repos with access issues
    }
  }

  return NextResponse.json({ reconciled: totalInserted });
}
