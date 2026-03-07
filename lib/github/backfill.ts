import { Octokit } from "octokit";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { hashRepoName, sanitizeForPrivateRepo } from "./sanitize";

import { toDateInTimezone } from "@/lib/dates";

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

export interface DiscoveredRepo {
  id: number;
  full_name: string;
  owner: string;
  name: string;
  visibility: "public" | "private";
}

export async function discoverRepos(): Promise<DiscoveredRepo[]> {
  const { github_username, github_org } = await getSettings();
  const octokit = await createAuthenticatedOctokit();
  const repos: DiscoveredRepo[] = [];

  // Personal repos
  const personalRepos = await octokit.paginate(octokit.rest.repos.listForUser, {
    username: github_username,
    per_page: 100,
    type: "owner",
  });

  for (const repo of personalRepos) {
    repos.push({
      id: repo.id,
      full_name: repo.full_name,
      owner: repo.owner?.login || github_username,
      name: repo.name,
      visibility: repo.private ? "private" : "public",
    });
  }

  // Org repos
  if (github_org) {
    try {
      const orgRepos = await octokit.paginate(octokit.rest.repos.listForOrg, {
        org: github_org,
        per_page: 100,
      });

      for (const repo of orgRepos) {
        if (!repos.some((r) => r.id === repo.id)) {
          repos.push({
            id: repo.id,
            full_name: repo.full_name,
            owner: repo.owner?.login || github_org,
            name: repo.name,
            visibility: repo.private ? "private" : "public",
          });
        }
      }
    } catch {
      // Org may not be accessible
    }
  }

  return repos;
}

export async function backfillRepoCommits(
  repo: DiscoveredRepo,
  since: string
): Promise<number> {
  const { github_username, timezone } = await getSettings();
  const octokit = await createAuthenticatedOctokit();
  const supabase = createAdminClient();
  let inserted = 0;

  const isPrivateRepo = repo.visibility === "private";
  const repoHash = await hashRepoName(repo.full_name);

  const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
    owner: repo.owner,
    repo: repo.name,
    author: github_username,
    since,
    per_page: 100,
  });

  const events = commits.map((commit) => {
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
  const { github_username, timezone } = await getSettings();
  const octokit = await createAuthenticatedOctokit();
  const supabase = createAdminClient();
  let inserted = 0;

  const prs = await octokit.paginate(octokit.rest.search.issuesAndPullRequests, {
    q: `author:${github_username} type:pr created:>=${since.split("T")[0]}`,
    per_page: 100,
  });

  // Build a set of known private repo names from discovered repos
  const discoveredRepos = await discoverRepos();
  const privateRepoNames = new Set(
    discoveredRepos.filter((r) => r.visibility === "private").map((r) => r.full_name)
  );

  const events = [];
  for (const pr of prs) {
    const repoUrl = pr.repository_url || "";
    const repoParts = repoUrl.split("/");
    const repoFullName = `${repoParts[repoParts.length - 2]}/${repoParts[repoParts.length - 1]}`;
    const repoHash = await hashRepoName(repoFullName);
    const isPrivate = privateRepoNames.has(repoFullName);

    const kinds = [];
    if (pr.state === "open") kinds.push("pr_opened");
    else if (pr.pull_request?.merged_at) kinds.push("pr_merged");
    else kinds.push("pr_closed");

    for (const kind of kinds) {
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
        repo_visibility: isPrivate ? ("private" as const) : ("public" as const),
        repo_hash: repoHash,
        visibility: isPrivate ? ("private" as const) : ("public" as const),
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
