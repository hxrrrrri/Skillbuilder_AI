import { describe, expect, it } from "vitest";
import { estimateTokens, estimateBytesTokens, buildLedger } from "./token-meter";

describe("estimateTokens", () => {
  it("returns 0 for empty", () => {
    expect(estimateTokens("")).toBe(0);
  });
  it("rounds up based on 4 chars/token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("estimateBytesTokens", () => {
  it("converts bytes to ~tokens", () => {
    expect(estimateBytesTokens(4096)).toBe(1024);
  });
});

describe("buildLedger", () => {
  it("computes savedPct", () => {
    const l = buildLedger(1000, 200);
    expect(l.raw).toBe(1000);
    expect(l.used).toBe(200);
    expect(l.savedPct).toBe(80);
  });
  it("handles zero raw", () => {
    expect(buildLedger(0, 0).savedPct).toBe(0);
  });
});
