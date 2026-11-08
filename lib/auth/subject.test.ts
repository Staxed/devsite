import { describe, expect, it } from "vitest";
import { parseSessionSubject, sessionSubject } from "./subject";

const ADDRESS = "0x1234567890abcdef1234567890ABCDEF12345678";

describe("session subject", () => {
  it("stores the chain number, not the CAIP id, and reads it back", () => {
    const sub = sessionSubject("eip155:1", ADDRESS);
    expect(sub).toBe(`1:${ADDRESS}`);
    expect(parseSessionSubject(sub)).toEqual({ address: ADDRESS, chainId: 1 });
  });

  it("reads a CAIP-prefixed subject written before the fix", () => {
    expect(parseSessionSubject(`eip155:1:${ADDRESS}`)).toEqual({ address: ADDRESS, chainId: 1 });
  });

  it("rejects a subject without an address", () => {
    expect(parseSessionSubject("eip155:1")).toBeNull();
    expect(parseSessionSubject("garbage")).toBeNull();
  });
});
