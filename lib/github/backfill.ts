import { Octokit } from "octokit";
import { createPrivateKey, createSign } from "node:crypto";
import { GITHUB_USERNAME, GITHUB_ORG, TIMEZONE } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/server";
import { hashRepoName, sanitizeForPrivateRepo } from "./sanitize";

function toDateInTimezone(isoDate: string, tz: string): string {
  return new Date(isoDate).toLocaleDateString("en-CA", { timeZone: tz });
}

async function getInstallationToken(): Promise<string> {
  const appId = process.env.GITHUB_APP_ID!;
  const privateKeyBase64 = process.env.GITHUB_APP_PRIVATE_KEY!;
  const privateKeyPem = Buffer.from(privateKeyBase64, "base64").toString("utf-8");

  // Create JWT
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId })
  ).toString("base64url");

  const key = createPrivateKey(privateKeyPem);
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(key, "base64url");
  const jwt = `${header}.${payload}.${signature}`;

  // Get installations
  const appOctokit = new Octokit({ auth: jwt });
  const { data: installations } = await appOctokit.rest.apps.listInstallations();

  if (installations.length === 0) {
    throw new Error("No GitHub App installations found");
  }

  // Get token from first installation (or the one matching our user/org)
  const installation = installations.find(
    (i) =>
      i.account?.login?.toLowerCase() === GITHUB_USERNAME.toLowerCase() ||
      i.account?.login?.toLowerCase() === GITHUB_ORG.toLowerCase()
  ) || installations[0];

  const { data: tokenData } = await appOctokit.rest.apps.createInstallationAccessToken({
    installation_id: installation.id,
  });

  return tokenData.token;
}

export async function createAuthenticatedOctokit(): Promise<Octokit> {
  const token = await getInstallationToken();
  return new Octokit({ auth: token });
}

export interface DiscoveredRepo {
  id: number;
  full_name: string;
  owner: string;
  name: string;
  visibility: "public" | "private";
}

export async function discoverRepos(): Promise<DiscoveredRepo[]> {
  const octokit = await createAuthenticatedOctokit();
  const repos: DiscoveredRepo[] = [];

  // Personal repos
  const personalRepos = await octokit.paginate(octokit.rest.repos.listForUser, {
    username: GITHUB_USERNAME,
    per_page: 100,
    type: "owner",
  });

  for (const repo of personalRepos) {
    repos.push({
      id: repo.id,
      full_name: repo.full_name,
      owner: repo.owner?.login || GITHUB_USERNAME,
      name: repo.name,
      visibility: repo.private ? "private" : "public",
    });
  }

  // Org repos
  try {
    const orgRepos = await octokit.paginate(octokit.rest.repos.listForOrg, {
      org: GITHUB_ORG,
      per_page: 100,
    });

    for (const repo of orgRepos) {
      if (!repos.some((r) => r.id === repo.id)) {
        repos.push({
          id: repo.id,
          full_name: repo.full_name,
          owner: repo.owner?.login || GITHUB_ORG,
          name: repo.name,
          visibility: repo.private ? "private" : "public",
        });
      }
    }
  } catch {
    // Org may not be accessible
  }

  return repos;
}

export async function backfillRepoCommits(
  repo: DiscoveredRepo,
  since: string
): Promise<number> {
  const octokit = await createAuthenticatedOctokit();
  const supabase = createAdminClient();
  let inserted = 0;

  const isPrivateRepo = repo.visibility === "private";
  const repoHash = hashRepoName(repo.full_name);

  const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
    owner: repo.owner,
    repo: repo.name,
    author: GITHUB_USERNAME,
    since,
    per_page: 100,
  });

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
      metadata: { sha: commit.sha, repo: repo.full_name },
      dedupe_key: `commit:${repo.full_name}:${commit.sha}`,
      repo_visibility: repo.visibility,
      repo_hash: repoHash,
    };

    if (isPrivateRepo) {
      const sanitized = sanitizeForPrivateRepo({
        title: subject,
        url: commit.html_url,
        repo_full_name: repo.full_name,
      });
      return { ...base, ...sanitized, visibility: "private" as const };
    }

    return {
      ...base,
      title: subject,
      public_summary: `Pushed to ${repo.full_name}`,
      url: commit.html_url,
      visibility: "public" as const,
    };
  });

  if (events.length > 0) {
    // Insert in batches of 100
    for (let i = 0; i < events.length; i += 100) {
      const batch = events.slice(i, i + 100);
      const { data } = await supabase
        .from("activity_events")
        .upsert(batch, { onConflict: "dedupe_key", ignoreDuplicates: true })
        .select("id");
      inserted += data?.length || 0;
    }
  }

  return inserted;
}

export async function backfillPRs(since: string): Promise<number> {
  const octokit = await createAuthenticatedOctokit();
  const supabase = createAdminClient();
  let inserted = 0;

  const prs = await octokit.paginate(octokit.rest.search.issuesAndPullRequests, {
    q: `author:${GITHUB_USERNAME} type:pr created:>=${since.split("T")[0]}`,
    per_page: 100,
  });

  const events = [];
  for (const pr of prs) {
    const repoUrl = pr.repository_url || "";
    const repoParts = repoUrl.split("/");
    const repoFullName = `${repoParts[repoParts.length - 2]}/${repoParts[repoParts.length - 1]}`;
    const repoHash = hashRepoName(repoFullName);

    const kinds = [];
    if (pr.state === "open") kinds.push("pr_opened");
    else if (pr.pull_request?.merged_at) kinds.push("pr_merged");
    else kinds.push("pr_closed");

    for (const kind of kinds) {
      const timestamp = pr.updated_at || pr.created_at;
      events.push({
        occurred_at: timestamp,
        occurred_on: toDateInTimezone(timestamp, TIMEZONE),
        source: "github" as const,
        category: "code",
        kind,
        value: 1,
        unit: "count",
        title: `${kind === "pr_merged" ? "Merged" : kind === "pr_opened" ? "Opened" : "Closed"} PR #${pr.number}: ${pr.title}`,
        public_summary: `${kind === "pr_merged" ? "Merged" : kind === "pr_opened" ? "Opened" : "Closed"} PR in ${repoFullName}`,
        url: pr.html_url,
        metadata: { pr_number: pr.number, repo: repoFullName },
        dedupe_key: `pr:${repoFullName}:${pr.number}:${kind}`,
        repo_visibility: "public" as const,
        repo_hash: repoHash,
        visibility: "public" as const,
      });
    }
  }

  if (events.length > 0) {
    for (let i = 0; i < events.length; i += 100) {
      const batch = events.slice(i, i + 100);
      const { data } = await supabase
        .from("activity_events")
        .upsert(batch, { onConflict: "dedupe_key", ignoreDuplicates: true })
        .select("id");
      inserted += data?.length || 0;
    }
  }

  return inserted;
}
