import { createHash } from "node:crypto";

export function hashRepoName(fullName: string): string {
  return createHash("sha256").update(fullName).digest("hex");
}

export function sanitizeForPrivateRepo(event: {
  title: string | null;
  url: string | null;
  repo_full_name: string;
}): { title: string | null; public_summary: string | null; url: string | null; repo_hash: string } {
  const repo_hash = hashRepoName(event.repo_full_name);

  // Keep commit subject in title but strip repo context
  const title = event.title
    ? event.title.replace(event.repo_full_name, "(private repo)")
    : null;

  return {
    title,
    public_summary: "Activity in a private repository",
    url: null,
    repo_hash,
  };
}
