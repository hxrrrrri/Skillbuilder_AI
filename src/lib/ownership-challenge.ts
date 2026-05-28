import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const OWNERSHIP_TOKEN_PREFIX = "spc_v1";
export const OWNERSHIP_CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000;

export type OwnershipChallengePayload = {
  v: 1;
  challengeId: string;
  userId: string;
  owner: string;
  repo: string;
  exp: string;
};

export type IssuedOwnershipChallenge = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
  payload: OwnershipChallengePayload;
};

export type VerifiedOwnershipChallengeToken = {
  ok: true;
  tokenHash: string;
  payload: OwnershipChallengePayload;
} | {
  ok: false;
  reason: "malformed" | "bad_signature" | "expired";
};

function secret() {
  return process.env.SKILLPROOF_OWNERSHIP_SECRET || process.env.NEXTAUTH_SECRET || "skillproof-dev-ownership-secret";
}

function base64UrlEncode(value: string | Buffer) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(parts: string[]) {
  return base64UrlEncode(createHmac("sha256", secret()).update(parts.join(".")).digest());
}

export function hashOwnershipToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueOwnershipChallengeToken(input: {
  challengeId: string;
  userId: string;
  owner: string;
  repo: string;
  ttlMs?: number;
}): IssuedOwnershipChallenge {
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? OWNERSHIP_CHALLENGE_TTL_MS));
  const payload: OwnershipChallengePayload = {
    v: 1,
    challengeId: input.challengeId,
    userId: input.userId,
    owner: input.owner,
    repo: input.repo,
    exp: expiresAt.toISOString(),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const nonce = base64UrlEncode(randomBytes(16));
  const signature = sign([OWNERSHIP_TOKEN_PREFIX, encodedPayload, nonce]);
  const token = [OWNERSHIP_TOKEN_PREFIX, encodedPayload, nonce, signature].join(".");
  return { token, tokenHash: hashOwnershipToken(token), expiresAt, payload };
}

export function verifyOwnershipChallengeToken(token: string): VerifiedOwnershipChallengeToken {
  const parts = token.trim().split(".");
  if (parts.length !== 4 || parts[0] !== OWNERSHIP_TOKEN_PREFIX) return { ok: false, reason: "malformed" };
  const expected = sign(parts.slice(0, 3));
  const got = parts[3];
  const expectedBytes = Buffer.from(expected);
  const gotBytes = Buffer.from(got);
  if (expectedBytes.length !== gotBytes.length || !timingSafeEqual(expectedBytes, gotBytes)) {
    return { ok: false, reason: "bad_signature" };
  }
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as OwnershipChallengePayload;
    if (payload.v !== 1 || !payload.challengeId || !payload.userId || !payload.owner || !payload.repo || !payload.exp) {
      return { ok: false, reason: "malformed" };
    }
    if (new Date(payload.exp).getTime() <= Date.now()) return { ok: false, reason: "expired" };
    return { ok: true, payload, tokenHash: hashOwnershipToken(token) };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export function extractOwnershipChallengeTokens(content: string): string[] {
  const re = new RegExp(`${OWNERSHIP_TOKEN_PREFIX}\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+`, "g");
  return Array.from(new Set(content.match(re) ?? []));
}

export function contentHasOwnershipTokenHash(content: string, tokenHash: string) {
  return extractOwnershipChallengeTokens(content).some((token) => hashOwnershipToken(token) === tokenHash);
}
