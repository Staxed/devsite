import { describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock("@/lib/settings", () => ({ getSettings: async () => ({ excluded_repos: ["Acme/hidden"] }) }));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: rows.data, error: null }) }) }) }),
  }),
}));

import { GET } from "./route";

function ev(repo: string, id: number) {
  return { id, occurred_at: "2026-01-05T15:00:00Z", occurred_on: "2026-01-05", kind: "commit_pushed", title: `secret ${id}`, visibility: "public", url: `https://github.com/${repo}/c/${id}`, metadata: { repo } };
}

describe("public timeline", () => {
  it("withholds excluded repos and returns one redacted row per day", async () => {
    rows.data = [ev("Acme/open", 1), ev("Acme/hidden", 2), ev("Acme/hidden", 3)];
    const res = await GET({ nextUrl: new URL("http://x/api/public/timeline") } as never);
    const body = await res.json();
    const text = JSON.stringify(body);
    expect(text).toContain("Active in 1 redacted repos · 2 events");
    expect(text).not.toContain("secret 2");
    expect(text).not.toContain("Acme/hidden");
    expect(body.rows).toHaveLength(2);
  });
});
