import { createHmac, timingSafeEqual } from "node:crypto";

const SCHEME = "v1";

export function getBadgeSecret(): string | null {
  const s = process.env.BADGE_SIGNING_SECRET;
  return s && s.length >= 16 ? s : null;
}

export function signBadge(slug: string, secret = getBadgeSecret()): string | null {
  if (!secret) return null;
  const mac = createHmac("sha256", secret).update(`${SCHEME}.${slug}`).digest("hex");
  return `${SCHEME}.${mac}`;
}

export function verifyBadge(slug: string, sig: string | null, secret = getBadgeSecret()): boolean {
  if (!secret || !sig) return false;
  const [scheme, mac] = sig.split(".");
  if (scheme !== SCHEME || !mac) return false;
  const expected = createHmac("sha256", secret).update(`${SCHEME}.${slug}`).digest("hex");
  if (mac.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
