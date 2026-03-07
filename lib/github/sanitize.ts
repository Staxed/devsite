export async function hashRepoName(fullName: string): Promise<string> {
  const data = new TextEncoder().encode(fullName);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function sanitizeForPrivateRepo(event: {
  title: string | null;
  url: string | null;
  repo_full_name: string;
}): { title: string | null; public_summary: string | null; url: string | null } {
  // Keep commit subject in title but strip repo context
  const title = event.title
    ? event.title.replace(event.repo_full_name, "(private repo)")
    : null;

  return {
    title,
    public_summary: "Activity in a private repository",
    url: null,
  };
}
