import { describe, expect, it } from "vitest";
import {
  contentHasOwnershipTokenHash,
  extractOwnershipChallengeTokens,
  hashOwnershipToken,
  issueOwnershipChallengeToken,
  verifyOwnershipChallengeToken,
} from "./ownership-challenge";

describe("ownership challenge tokens", () => {
  it("issues signed tokens tied to user, repo, challenge, and expiration", () => {
    const issued = issueOwnershipChallengeToken({
      challengeId: "challenge-1",
      userId: "user-1",
      owner: "hxrrrrri",
      repo: "Skillbuilder_AI",
    });

    const verified = verifyOwnershipChallengeToken(issued.token);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.tokenHash).toBe(issued.tokenHash);
      expect(verified.payload).toMatchObject({
        challengeId: "challenge-1",
        userId: "user-1",
        owner: "hxrrrrri",
        repo: "Skillbuilder_AI",
      });
    }
  });

  it("detects a persisted token hash in README or .skillproof-verify.json content", () => {
    const issued = issueOwnershipChallengeToken({
      challengeId: "challenge-2",
      userId: "user-1",
      owner: "octo",
      repo: "repo",
    });

    const content = `SkillProof ownership: ${issued.token}`;
    expect(extractOwnershipChallengeTokens(content)).toEqual([issued.token]);
    expect(contentHasOwnershipTokenHash(content, issued.tokenHash)).toBe(true);
    expect(contentHasOwnershipTokenHash(content, hashOwnershipToken(`${issued.token}x`))).toBe(false);
  });

  it("fails closed for tampered or expired tokens", () => {
    const issued = issueOwnershipChallengeToken({
      challengeId: "challenge-3",
      userId: "user-1",
      owner: "octo",
      repo: "repo",
      ttlMs: -1,
    });

    expect(verifyOwnershipChallengeToken(`${issued.token}x`)).toMatchObject({ ok: false });
    expect(verifyOwnershipChallengeToken(issued.token)).toEqual({ ok: false, reason: "expired" });
  });
});
