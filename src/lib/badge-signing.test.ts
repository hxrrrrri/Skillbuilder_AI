import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signBadge, verifyBadge } from "./badge-signing";

describe("badge-signing", () => {
  const originalSecret = process.env.BADGE_SIGNING_SECRET;

  beforeEach(() => {
    process.env.BADGE_SIGNING_SECRET = "test-secret-1234567890";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete (process.env as any).BADGE_SIGNING_SECRET;
    else process.env.BADGE_SIGNING_SECRET = originalSecret;
  });

  it("returns null when secret missing", () => {
    delete (process.env as any).BADGE_SIGNING_SECRET;
    expect(signBadge("alice")).toBeNull();
    expect(verifyBadge("alice", "v1.deadbeef")).toBe(false);
  });

  it("round-trips a signature", () => {
    const sig = signBadge("alice");
    expect(sig).toMatch(/^v1\.[a-f0-9]{64}$/);
    expect(verifyBadge("alice", sig)).toBe(true);
  });

  it("rejects a forged signature", () => {
    const real = signBadge("alice")!;
    expect(verifyBadge("alice", real.replace(/.$/, "0"))).toBe(false);
    expect(verifyBadge("bob", real)).toBe(false);
  });

  it("rejects unknown scheme", () => {
    expect(verifyBadge("alice", "v2.abcd")).toBe(false);
    expect(verifyBadge("alice", null)).toBe(false);
  });
});
