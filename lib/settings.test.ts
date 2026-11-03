import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ data: [] as { key: string; value: string }[] }));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: () => ({ select: async () => ({ data: rows.data, error: null }) }) }),
}));

import { getSettings, invalidateSettingsCache } from "./settings";

const base = [
  { key: "github_username", value: "Staxed" },
  { key: "timezone", value: "America/New_York" },
];

describe("getSettings excluded_repos", () => {
  beforeEach(() => invalidateSettingsCache());

  it("splits on commas, trims and drops empty entries", async () => {
    rows.data = [...base, { key: "excluded_repos", value: " A/b , ,C/*,, " }];
    expect((await getSettings()).excluded_repos).toEqual(["A/b", "C/*"]);
  });

  it("is empty when the key is missing", async () => {
    rows.data = base;
    expect((await getSettings()).excluded_repos).toEqual([]);
  });
});
