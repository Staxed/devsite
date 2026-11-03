import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/discord/verify", () => ({ verifyDiscordRequest: async () => true }));
const handlers = vi.hoisted(() => ({
  handleLog: vi.fn(async () => ({ content: "logged" })),
  handleHabitDone: vi.fn(async () => ({ content: "habit done" })),
  handleStats: vi.fn(async () => ({ content: "stats" })),
  handleActivityStats: vi.fn(),
  handleActivityStreak: vi.fn(),
  handleActivityRepos: vi.fn(),
  handleActivityInsights: vi.fn(),
  handleActivityBadges: vi.fn(),
}));
vi.mock("@/lib/discord/handlers", () => handlers);

import { POST } from "./route";

const OWNER = "111";

function call(name: string, caller: { guild?: string; dm?: string }) {
  const interaction = {
    type: 2,
    data: { name, options: [] },
    ...(caller.guild ? { member: { user: { id: caller.guild } } } : { user: { id: caller.dm } }),
  };
  return POST(new Request("http://x/api/discord/interactions", {
    method: "POST",
    body: JSON.stringify(interaction),
  }) as never).then((r) => r.json());
}

describe("interactions owner lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DISCORD_OWNER_ID = OWNER;
  });

  it.each(["log", "habit"])("refuses /%s from a non-owner, ephemerally, and writes nothing", async (name) => {
    const res = await call(name, { guild: "222" });
    expect(res.data.flags).toBe(64);
    expect(handlers.handleLog).not.toHaveBeenCalled();
    expect(handlers.handleHabitDone).not.toHaveBeenCalled();
  });

  it("refuses a non-owner in a DM", async () => {
    const res = await call("log", { dm: "222" });
    expect(res.data.flags).toBe(64);
    expect(handlers.handleLog).not.toHaveBeenCalled();
  });

  it("runs /log and /habit for the owner in a guild and in a DM", async () => {
    expect((await call("log", { guild: OWNER })).data.content).toBe("logged");
    expect((await call("habit", { dm: OWNER })).data.content).toBe("habit done");
  });

  it("leaves /stats open to everyone", async () => {
    expect((await call("stats", { guild: "222" })).data.content).toBe("stats");
  });
});
