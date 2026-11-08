import { describe, expect, it } from "vitest";
import { decideTick } from "./tick";

describe("decideTick", () => {
  it("does nothing unless CRON_ENABLED is exactly true", () => {
    const now = new Date("2026-07-15T13:00:00Z");
    expect(decideTick(now, undefined)).toEqual([]);
    expect(decideTick(now, "false")).toEqual([]);
    expect(decideTick(now, "1")).toEqual([]);
  });

  it("polls then digests on the top-of-hour tick", () => {
    expect(decideTick(new Date("2026-07-15T12:00:00Z"), "true")).toEqual(["poll", "digest"]);
    expect(decideTick(new Date("2026-07-15T14:00:00Z"), "true")).toEqual(["poll", "digest"]);
    expect(decideTick(new Date("2026-01-15T15:00:00Z"), "true")).toEqual(["poll", "digest"]);
  });

  it("only polls on the half-hour tick, including in the 09:30 hour", () => {
    expect(decideTick(new Date("2026-07-15T13:30:00Z"), "true")).toEqual(["poll"]);
    expect(decideTick(new Date("2026-07-15T12:30:00Z"), "true")).toEqual(["poll"]);
    expect(decideTick(new Date("2026-01-15T14:30:00Z"), "true")).toEqual(["poll"]);
  });

  it("polls, digests and posts summaries at 09:00 New York in summer (EDT)", () => {
    expect(decideTick(new Date("2026-07-15T13:00:00Z"), "true")).toEqual(["poll", "digest", "summaries"]);
  });

  it("polls, digests and posts summaries at 09:00 New York in winter (EST)", () => {
    expect(decideTick(new Date("2026-01-15T14:00:00Z"), "true")).toEqual(["poll", "digest", "summaries"]);
  });

  it("keeps 09:00 New York on the tick across both daylight-saving changes", () => {
    // US spring forward 2026-03-08, fall back 2026-11-01
    const want = ["poll", "digest", "summaries"];
    expect(decideTick(new Date("2026-03-07T14:00:00Z"), "true")).toEqual(want);
    expect(decideTick(new Date("2026-03-08T13:00:00Z"), "true")).toEqual(want);
    expect(decideTick(new Date("2026-10-31T13:00:00Z"), "true")).toEqual(want);
    expect(decideTick(new Date("2026-11-01T14:00:00Z"), "true")).toEqual(want);
  });

  it("does not post summaries at the other season's 09:00 UTC hour", () => {
    expect(decideTick(new Date("2026-07-15T14:00:00Z"), "true")).toEqual(["poll", "digest"]);
    expect(decideTick(new Date("2026-01-15T13:00:00Z"), "true")).toEqual(["poll", "digest"]);
  });
});
