import { describe, expect, it, vi } from "vitest";
import { createScheduled } from "./scheduled";

// 2026-07-15 13:00 UTC = 09:00 New York (summer); 14:00 UTC = 10:00.
const inWindow = Date.UTC(2026, 6, 15, 13, 0);
const outWindow = Date.UTC(2026, 6, 15, 14, 0);

function setup(status = 200) {
  const calls: Request[] = [];
  const fetchFn = vi.fn(async (r: Request) => {
    calls.push(r);
    return new Response("", { status });
  });
  const waits: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) };
  return { calls, ctx, waits, scheduled: createScheduled(fetchFn) };
}

describe("scheduled", () => {
  it("does nothing when disabled", async () => {
    const s = setup();
    await s.scheduled({ scheduledTime: inWindow }, { CRON_SECRET: "x" }, s.ctx);
    await Promise.all(s.waits);
    expect(s.calls).toHaveLength(0);
  });

  it("throws without CRON_SECRET when enabled", async () => {
    const s = setup();
    await expect(s.scheduled({ scheduledTime: outWindow }, { CRON_ENABLED: "true" }, s.ctx)).rejects.toThrow(/CRON_SECRET/);
  });

  it("posts poll only outside the window, with the secret header", async () => {
    const s = setup();
    await s.scheduled({ scheduledTime: outWindow }, { CRON_ENABLED: "true", CRON_SECRET: "sek" }, s.ctx);
    await Promise.all(s.waits);
    expect(s.calls.map((r) => new URL(r.url).pathname)).toEqual(["/api/cron/poll-github"]);
    expect(s.calls[0].method).toBe("POST");
    expect(s.calls[0].headers.get("x-cron-secret")).toBe("sek");
  });

  it("runs poll before summaries inside the window", async () => {
    const s = setup();
    await s.scheduled({ scheduledTime: inWindow }, { CRON_ENABLED: "true", CRON_SECRET: "sek" }, s.ctx);
    await Promise.all(s.waits);
    expect(s.calls.map((r) => new URL(r.url).pathname)).toEqual(["/api/cron/poll-github", "/api/cron/summaries"]);
  });

  it("fails on a non-ok response", async () => {
    const s = setup(500);
    await s.scheduled({ scheduledTime: outWindow }, { CRON_ENABLED: "true", CRON_SECRET: "sek" }, s.ctx);
    await expect(Promise.all(s.waits)).rejects.toThrow(/failed: 500/);
  });
});
