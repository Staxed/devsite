import { beforeEach, describe, expect, it, vi } from "vitest";

const postHourlyDigest = vi.hoisted(() => vi.fn(async () => 2));
vi.mock("@/lib/discord/digest", () => ({ postHourlyDigest }));
vi.mock("@/lib/activity/store", () => ({ createSupabaseStore: () => ({}) }));

import { POST } from "./route";

const call = (secret: string | null) =>
  POST(new Request("http://x/api/cron/digest", { method: "POST", headers: secret ? { "x-cron-secret": secret } : {} }) as never);

describe("digest cron endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "sek";
    process.env.DISCORD_CHANNEL_ID = "chan";
  });

  it("rejects a wrong secret without posting", async () => {
    expect((await call("nope")).status).toBe(401);
    expect(postHourlyDigest).not.toHaveBeenCalled();
  });

  it("rejects a missing secret without posting", async () => {
    expect((await call(null)).status).toBe(401);
    expect(postHourlyDigest).not.toHaveBeenCalled();
  });

  it("posts the digest with the right secret", async () => {
    const res = await call("sek");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, lines: 2 });
    expect(postHourlyDigest).toHaveBeenCalledOnce();
  });
});
