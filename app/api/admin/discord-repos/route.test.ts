import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/activity/memory-store";

let admin: { id: string } | null;
let store: ReturnType<typeof createMemoryStore>;
const discover = vi.fn();

vi.mock("@/lib/auth/admin", () => ({ verifyAdmin: async () => admin }));
vi.mock("@/lib/github/backfill", () => ({ discoverRepos: () => discover() }));
vi.mock("@/lib/activity/store", () => ({ createSupabaseStore: () => store }));

import { GET, POST, PUT } from "./route";

const send = (handler: (request: never) => Promise<Response>, method: string, body: unknown) =>
  handler(new Request("http://x/api/admin/discord-repos", { method, body: JSON.stringify(body) }) as never);

const github = (full_name: string, visibility: "public" | "private") => {
  const [owner, name] = full_name.split("/");
  return { id: 1, full_name, owner, name, visibility };
};

beforeEach(() => {
  admin = { id: "admin" };
  store = createMemoryStore();
  discover.mockReset().mockResolvedValue([]);
});

describe("unauthenticated", () => {
  it("is refused on every method", async () => {
    admin = null;
    expect((await GET()).status).toBe(401);
    expect((await send(PUT, "PUT", { repos: [] })).status).toBe(401);
    expect((await send(POST, "POST", { repo_full_name: "a/b" })).status).toBe(401);
    expect(store.discordRepos).toEqual([]);
  });
});

describe("GET", () => {
  it("merges GitHub, stored activity and saved rows, treating unknown visibility as private", async () => {
    discover.mockResolvedValue([github("me/public-one", "public"), github("me/secret", "private")]);
    await store.upsertEvents([
      { source: "github", metadata: { repo: "other/seen" }, repo_visibility: "public" },
      { source: "github", metadata: { repo: "me/public-one" }, repo_visibility: "private" },
    ] as never);
    store.discordRepos.push({ repo_full_name: "typed/by-hand", display_name: "Hand", included: true });

    const { repos } = await (await GET()).json();

    const byName = Object.fromEntries(repos.map((r: { repo_full_name: string }) => [r.repo_full_name, r]));
    expect(Object.keys(byName).sort()).toEqual(["me/public-one", "me/secret", "other/seen", "typed/by-hand"]);
    expect(byName["me/public-one"].visibility).toBe("public");
    expect(byName["me/secret"].visibility).toBe("private");
    expect(byName["other/seen"].visibility).toBe("private");
    expect(byName["typed/by-hand"]).toMatchObject({ visibility: "private", display_name: "Hand", included: true });
  });

  it("flags a ticked repo with no name and private activity as needing a name", async () => {
    discover.mockResolvedValue([github("me/pub", "public")]);
    await store.upsertEvents([{ source: "github", metadata: { repo: "me/pub" }, repo_visibility: "private" }] as never);
    store.discordRepos.push({ repo_full_name: "me/pub", display_name: null, included: true });

    const { repos } = await (await GET()).json();

    expect(repos[0].needs_name).toBe(true);
  });
});

describe("PUT", () => {
  it("refuses to tick a private repo without a display name and writes nothing", async () => {
    discover.mockResolvedValue([github("me/secret", "private"), github("me/pub", "public")]);

    const res = await send(PUT, "PUT", {
      repos: [
        { repo_full_name: "me/pub", display_name: "", included: true },
        { repo_full_name: "me/secret", display_name: "  ", included: true },
      ],
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("me/secret");
    expect(store.discordRepos).toEqual([]);
  });

  it("writes only changed rows", async () => {
    discover.mockResolvedValue([github("me/secret", "private"), github("me/pub", "public")]);
    store.discordRepos.push({ repo_full_name: "me/pub", display_name: "Pub", included: true });

    const res = await send(PUT, "PUT", {
      repos: [
        { repo_full_name: "me/pub", display_name: "Pub", included: true },
        { repo_full_name: "me/secret", display_name: " Vault ", included: true },
      ],
    });

    expect(res.status).toBe(200);
    expect((await res.json()).saved).toBe(1);
    expect(store.discordRepos).toEqual([
      { repo_full_name: "me/pub", display_name: "Pub", included: true },
      { repo_full_name: "me/secret", display_name: "Vault", included: true },
    ]);
  });

  it("allows ticking a public repo with an empty name", async () => {
    discover.mockResolvedValue([github("me/pub", "public")]);

    const res = await send(PUT, "PUT", { repos: [{ repo_full_name: "me/pub", display_name: "", included: true }] });

    expect(res.status).toBe(200);
    expect(store.discordRepos).toEqual([{ repo_full_name: "me/pub", display_name: null, included: true }]);
  });

  it("rejects a malformed body", async () => {
    expect((await send(PUT, "PUT", { repos: [{ repo_full_name: "nope", included: true }] })).status).toBe(400);
  });
});

describe("POST (Add repo)", () => {
  it("creates an unticked row", async () => {
    const res = await send(POST, "POST", { repo_full_name: "owner/repo" });

    expect(res.status).toBe(201);
    expect(store.discordRepos).toEqual([{ repo_full_name: "owner/repo", display_name: null, included: false }]);
  });

  it("keeps an existing row as it is", async () => {
    store.discordRepos.push({ repo_full_name: "owner/repo", display_name: "R", included: true });

    await send(POST, "POST", { repo_full_name: "owner/repo" });

    expect(store.discordRepos).toEqual([{ repo_full_name: "owner/repo", display_name: "R", included: true }]);
  });

  it("rejects something that is not owner/repo", async () => {
    expect((await send(POST, "POST", { repo_full_name: "just-a-name" })).status).toBe(400);
    expect(store.discordRepos).toEqual([]);
  });
});
