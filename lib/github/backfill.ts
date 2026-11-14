import { Octokit } from "octokit";
import { getSettings } from "@/lib/settings";
import { createSupabaseStore, insertNewEvents, type ActivityStore, type NewEvent } from "@/lib/activity/store";
import { hashRepoName, sanitizeForPrivateRepo } from "./sanitize";

import { toDateInTimezone, todayInTimezone } from "@/lib/dates";

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const lines = pem.split("\n").filter((l) => !l.startsWith("-----") && l.trim());
  const binary = atob(lines.join(""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Wrap a PKCS#1 RSA private key DER in a PKCS#8 envelope.
 * GitHub App keys are PKCS#1 (BEGIN RSA PRIVATE KEY), but
 * crypto.subtle.importKey("pkcs8") requires PKCS#8 format.
 */
function pkcs1ToPkcs8(pkcs1Der: ArrayBuffer): ArrayBuffer {
  const pkcs1Bytes = new Uint8Array(pkcs1Der);

  // PKCS#8 wraps PKCS#1 with:
  // SEQUENCE {
  //   INTEGER 0
  //   SEQUENCE { OID rsaEncryption, NULL }
  //   OCTET STRING { <pkcs1 DER> }
  // }
  const rsaOid = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
    0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);

  // Encode the OCTET STRING wrapping the PKCS#1 key
  const octetString = wrapAsn1(0x04, pkcs1Bytes);
  // Version INTEGER 0
  const version = new Uint8Array([0x02, 0x01, 0x00]);

  // Combine into SEQUENCE
  const inner = new Uint8Array(version.length + rsaOid.length + octetString.length);
  inner.set(version, 0);
  inner.set(rsaOid, version.length);
  inner.set(octetString, version.length + rsaOid.length);

  return wrapAsn1(0x30, inner).buffer as ArrayBuffer;
}

function wrapAsn1(tag: number, content: Uint8Array): Uint8Array {
  const len = content.length;
  let header: Uint8Array;
  if (len < 0x80) {
    header = new Uint8Array([tag, len]);
  } else if (len < 0x100) {
    header = new Uint8Array([tag, 0x81, len]);
  } else if (len < 0x10000) {
    header = new Uint8Array([tag, 0x82, (len >> 8) & 0xff, len & 0xff]);
  } else {
    header = new Uint8Array([tag, 0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }
  const result = new Uint8Array(header.length + content.length);
  result.set(header, 0);
  result.set(content, header.length);
  return result;
}

async function getInstallationToken(): Promise<string> {
  const appId = process.env.GITHUB_APP_ID!;
  const privateKeyBase64 = process.env.GITHUB_APP_PRIVATE_KEY!;
  const privateKeyPem = atob(privateKeyBase64);

  // Create JWT using Web Crypto API
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64UrlEncode(
    encoder.encode(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId }))
  );

  // GitHub App keys are PKCS#1; convert to PKCS#8 for Web Crypto API
  const pkcs1Der = pemToArrayBuffer(privateKeyPem);
  const pkcs8Der = pkcs1ToPkcs8(pkcs1Der);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigData = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(`${header}.${payload}`)
  );
  const signature = base64UrlEncode(sigData);
  const jwt = `${header}.${payload}.${signature}`;

  // Get installations
  const appOctokit = new Octokit({ auth: jwt });
  const { data: installations } = await appOctokit.rest.apps.listInstallations();

  if (installations.length === 0) {
    throw new Error("No GitHub App installations found");
  }

  // Get token from first installation (or the one matching our user/org)
  const { github_username, github_org } = await getSettings();
  const installation = installations.find(
    (i) =>
      i.account?.login?.toLowerCase() === github_username.toLowerCase() ||
      (github_org && i.account?.login?.toLowerCase() === github_org.toLowerCase())
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

/** The backfill reads Staxed's own activity, private repos included, with his personal token. */
export function createEventsOctokit(): Octokit {
  const token = process.env.GITHUB_EVENTS_TOKEN;
  if (!token) throw new Error("GITHUB_EVENTS_TOKEN is not set; the backfill reads Staxed's repos with it");
  return new Octokit({ auth: token });
}

export interface DiscoveredRepo {
  id: number;
  full_name: string;
  owner: string;
  name: string;
  visibility: "public" | "private";
  /** GitHub's archived flag; only discoverRepos sets it. */
  archived?: boolean;
}

/** Every repo Staxed owns, collaborates on or reaches through an organization. */
export async function discoverRepos(octokit: Octokit = createEventsOctokit()): Promise<DiscoveredRepo[]> {
  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    affiliation: "owner,collaborator,organization_member",
    per_page: 100,
  });
  return repos.map((repo) => ({
    id: repo.id,
    full_name: repo.full_name,
    owner: repo.owner.login,
    name: repo.name,
    visibility: repo.private ? "private" : "public",
    archived: repo.archived ?? false,
  }));
}

/**
 * Staxed's commits on the repo's default branch since `since`, as events.
 * The backfill marks them already posted; the poll leaves them unposted so the hourly digest sends them.
 */
export async function fetchRepoCommitEvents(
  octokit: Octokit,
  repo: DiscoveredRepo,
  since: string,
  markPosted: boolean
): Promise<NewEvent[]> {
  const { github_username, timezone } = await getSettings();

  const isPrivateRepo = repo.visibility === "private";
  const repoHash = await hashRepoName(repo.full_name);

  // No sha parameter: GitHub lists the default branch
  const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
    owner: repo.owner,
    repo: repo.name,
    author: github_username,
    since,
    per_page: 100,
  });

  return commits.map((commit): NewEvent => {
    const timestamp = commit.commit.author?.date || new Date().toISOString();
    const subject = (commit.commit.message || "").split("\n")[0];

    const base = {
      occurred_at: timestamp,
      occurred_on: toDateInTimezone(timestamp, timezone),
      source: "github" as const,
      category: "code",
      kind: "commit_pushed",
      value: 1,
      unit: "count",
      metadata: { sha: commit.sha, repo: repo.full_name },
      dedupe_key: `commit:${repo.full_name}:${commit.sha}`,
      repo_visibility: repo.visibility,
      repo_hash: repoHash,
      ...(markPosted ? { posted_to_discord: true } : {}),
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
}

/**
 * Store Staxed's commits on the repo's default branch since `since`.
 * Rows are written as already posted: a backfill never sends anything to Discord.
 */
export async function backfillRepoCommits(
  repo: DiscoveredRepo,
  since: string,
  store: ActivityStore = createSupabaseStore()
): Promise<number> {
  const events = await fetchRepoCommitEvents(createEventsOctokit(), repo, since, true);
  return insertNewEvents(store, events);
}

const SEARCH_RESULT_CAP = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type SearchedPullRequest = Awaited<
  ReturnType<Octokit["rest"]["search"]["issuesAndPullRequests"]>
>["data"]["items"][number];

/** Search caps a query at 1000 results, so a window over the cap is halved until each part fits. */
async function searchPullRequestsInWindow(
  octokit: Octokit,
  username: string,
  fromDate: string,
  toDate: string,
  repoFullName?: string
): Promise<SearchedPullRequest[]> {
  const q = `author:${username} type:pr${repoFullName ? ` repo:${repoFullName}` : ""} created:${fromDate}..${toDate}`;
  const { data } = await octokit.rest.search.issuesAndPullRequests({ q, per_page: 1 });
  if (data.total_count <= SEARCH_RESULT_CAP) {
    return octokit.paginate(octokit.rest.search.issuesAndPullRequests, { q, per_page: 100 });
  }
  if (fromDate === toDate) {
    throw new Error(`PR search for ${fromDate} has ${data.total_count} results, over the ${SEARCH_RESULT_CAP} cap, and cannot be split`);
  }
  const fromMs = Date.parse(fromDate);
  const midDate = new Date(fromMs + Math.floor((Date.parse(toDate) - fromMs) / DAY_MS / 2) * DAY_MS).toISOString().slice(0, 10);
  const nextDate = new Date(Date.parse(midDate) + DAY_MS).toISOString().slice(0, 10);
  return [
    ...(await searchPullRequestsInWindow(octokit, username, fromDate, midDate, repoFullName)),
    ...(await searchPullRequestsInWindow(octokit, username, nextDate, toDate, repoFullName)),
  ];
}

/** The PR events for these search results, as already posted. With `onlyRepos`, PRs in other repos are skipped. */
async function pullRequestEvents(
  prs: SearchedPullRequest[],
  timezone: string,
  isPrivateRepo: (repoFullName: string) => boolean,
  onlyRepos?: Set<string>
): Promise<NewEvent[]> {
  const events: NewEvent[] = [];
  for (const pr of prs) {
    const repoUrl = pr.repository_url || "";
    const repoParts = repoUrl.split("/");
    const repoFullName = `${repoParts[repoParts.length - 2]}/${repoParts[repoParts.length - 1]}`;
    if (onlyRepos && !onlyRepos.has(repoFullName)) continue;
    const repoHash = await hashRepoName(repoFullName);
    const isPrivate = isPrivateRepo(repoFullName);

    let kind: string;
    if (pr.state === "open") kind = "pr_opened";
    else if (pr.pull_request?.merged_at) kind = "pr_merged";
    else kind = "pr_closed";

    const timestamp = pr.updated_at || pr.created_at;
    const actionLabel = kind === "pr_merged" ? "Merged" : kind === "pr_opened" ? "Opened" : "Closed";
    events.push({
      occurred_at: timestamp,
      occurred_on: toDateInTimezone(timestamp, timezone),
      source: "github" as const,
      category: "code",
      kind,
      value: 1,
      unit: "count",
      title: `${actionLabel} PR #${pr.number}: ${pr.title}`,
      public_summary: `${actionLabel} PR in ${repoFullName}`,
      url: isPrivate ? null : pr.html_url,
      metadata: { pr_number: pr.number, repo: repoFullName },
      dedupe_key: `pr:${repoFullName}:${pr.number}:${kind}`,
      repo_visibility: isPrivate ? "private" : "public",
      repo_hash: repoHash,
      visibility: isPrivate ? "private" : "public",
      posted_to_discord: true,
    });
  }
  return events;
}

/** Store Staxed's PRs created since `since`, as already posted. With `onlyRepos`, PRs in other repos are skipped. */
export async function backfillPRs(
  since: string,
  store: ActivityStore = createSupabaseStore(),
  onlyRepos?: Set<string>
): Promise<number> {
  if (onlyRepos && onlyRepos.size === 0) return 0;
  const { github_username, timezone } = await getSettings();
  const octokit = createEventsOctokit();

  const prs = await searchPullRequestsInWindow(
    octokit,
    github_username,
    since.split("T")[0],
    todayInTimezone(timezone)
  );

  // Build a set of known private repo names from discovered repos
  const discoveredRepos = await discoverRepos();
  const privateRepoNames = new Set(
    discoveredRepos.filter((r) => r.visibility === "private").map((r) => r.full_name)
  );

  return insertNewEvents(store, await pullRequestEvents(prs, timezone, (name) => privateRepoNames.has(name), onlyRepos));
}

/** Store Staxed's PRs in one repo created since `since`, as already posted; the repo's visibility is already known. */
export async function backfillRepoPRs(
  repo: DiscoveredRepo,
  since: string,
  store: ActivityStore = createSupabaseStore()
): Promise<number> {
  const { github_username, timezone } = await getSettings();
  const prs = await searchPullRequestsInWindow(
    createEventsOctokit(),
    github_username,
    since.split("T")[0],
    todayInTimezone(timezone),
    repo.full_name
  );
  const events = await pullRequestEvents(prs, timezone, () => repo.visibility === "private", new Set([repo.full_name]));
  return insertNewEvents(store, events);
}
