import { describe, expect, it } from "vitest";
import { decideTick } from "./tick";

describe("decideTick", () => {
  it("does nothing unless CRON_ENABLED is exactly true", () => {
    const now = new Date("2026-07-15T13:00:00Z");
    expect(decideTick(now, undefined)).toEqual([]);
    expect(decideTick(now, "false")).toEqual([]);
    expect(decideTick(now, "1")).toEqual([]);
  });

  it("polls only outside the 09:00-09:29 New York window", () => {
    expect(decideTick(new Date("2026-07-15T13:30:00Z"), "true")).toEqual(["poll"]);
    expect(decideTick(new Date("2026-07-15T12:30:00Z"), "true")).toEqual(["poll"]);
    expect(decideTick(new Date("2026-01-15T14:30:00Z"), "true")).toEqual(["poll"]);
  });

  it("polls and posts summaries at 09:00 New York in summer (EDT)", () => {
    expect(decideTick(new Date("2026-07-15T13:00:00Z"), "true")).toEqual(["poll", "summaries"]);
  });

  it("polls and posts summaries at 09:00 New York in winter (EST)", () => {
    expect(decideTick(new Date("2026-01-15T14:00:00Z"), "true")).toEqual(["poll", "summaries"]);
  });

  it("does not post summaries at the other season's 09:00 UTC hour", () => {
    expect(decideTick(new Date("2026-07-15T14:00:00Z"), "true")).toEqual(["poll"]);
    expect(decideTick(new Date("2026-01-15T13:00:00Z"), "true")).toEqual(["poll"]);
  });
});
