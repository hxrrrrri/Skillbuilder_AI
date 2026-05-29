import { describe, expect, it } from "vitest";
import {
  TokenBucketRateLimiter,
  clientIp,
  rateLimitKey,
  rateLimitedResponseInit,
} from "./rate-limit";

// Controllable clock so refill tests are deterministic (no real timers).
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("TokenBucketRateLimiter", () => {
  it("allows up to N requests then blocks N+1", () => {
    const clock = fakeClock();
    const rl = new TokenBucketRateLimiter({ max: 3, windowMs: 60_000 }, { now: clock.now });

    expect(rl.consume("k").allowed).toBe(true);
    expect(rl.consume("k").allowed).toBe(true);
    const third = rl.consume("k");
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const blocked = rl.consume("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("refills tokens over time", () => {
    const clock = fakeClock();
    const rl = new TokenBucketRateLimiter({ max: 2, windowMs: 1000 }, { now: clock.now });

    expect(rl.consume("k").allowed).toBe(true);
    expect(rl.consume("k").allowed).toBe(true);
    expect(rl.consume("k").allowed).toBe(false); // empty

    // Window is 1000ms for 2 tokens => 1 token per 500ms.
    clock.advance(500);
    expect(rl.consume("k").allowed).toBe(true); // exactly 1 refilled
    expect(rl.consume("k").allowed).toBe(false); // back to empty

    // Full window refills to capacity (capped, no overflow).
    clock.advance(10_000);
    expect(rl.consume("k").allowed).toBe(true);
    expect(rl.consume("k").allowed).toBe(true);
    expect(rl.consume("k").allowed).toBe(false);
  });

  it("reports retryAfterMs that actually unblocks the caller", () => {
    const clock = fakeClock();
    const rl = new TokenBucketRateLimiter({ max: 1, windowMs: 2000 }, { now: clock.now });

    expect(rl.consume("k").allowed).toBe(true);
    const blocked = rl.consume("k");
    expect(blocked.allowed).toBe(false);

    clock.advance(blocked.retryAfterMs);
    expect(rl.consume("k").allowed).toBe(true);
  });

  it("isolates buckets per key", () => {
    const clock = fakeClock();
    const rl = new TokenBucketRateLimiter({ max: 1, windowMs: 60_000 }, { now: clock.now });

    expect(rl.consume("a").allowed).toBe(true);
    expect(rl.consume("a").allowed).toBe(false);
    expect(rl.consume("b").allowed).toBe(true); // separate bucket unaffected
  });

  it("reset() clears state for a key and for all keys", () => {
    const clock = fakeClock();
    const rl = new TokenBucketRateLimiter({ max: 1, windowMs: 60_000 }, { now: clock.now });

    expect(rl.consume("a").allowed).toBe(true);
    expect(rl.consume("a").allowed).toBe(false);
    rl.reset("a");
    expect(rl.consume("a").allowed).toBe(true);

    rl.consume("a");
    rl.reset();
    expect(rl.consume("a").allowed).toBe(true);
  });

  it("disabled limiter always allows", () => {
    const rl = new TokenBucketRateLimiter({ max: 1, windowMs: 60_000 }, { disabled: true });
    for (let i = 0; i < 100; i++) expect(rl.consume("k").allowed).toBe(true);
  });
});

describe("clientIp / rateLimitKey", () => {
  function reqWith(headers: Record<string, string>): Request {
    return new Request("https://example.test", { headers });
  }

  it("uses first x-forwarded-for hop", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip then unknown", () => {
    expect(clientIp(reqWith({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(reqWith({}))).toBe("unknown");
  });

  it("prefers userId, falls back to ip", () => {
    const req = reqWith({ "x-forwarded-for": "1.2.3.4" });
    expect(rateLimitKey(req, "u_123")).toBe("user:u_123");
    expect(rateLimitKey(req, null)).toBe("ip:1.2.3.4");
  });
});

describe("rateLimitedResponseInit", () => {
  it("builds a 429 with Retry-After and rate-limit headers", () => {
    const init = rateLimitedResponseInit({
      allowed: false,
      limit: 5,
      remaining: 0,
      retryAfterMs: 1500,
      resetMs: 3000,
    });
    expect(init.status).toBe(429);
    expect(init.body.error).toBe("rate_limited");
    expect(init.body.retry_after_seconds).toBe(2); // ceil(1500/1000)
    expect(init.headers["Retry-After"]).toBe("2");
    expect(init.headers["X-RateLimit-Limit"]).toBe("5");
    expect(init.headers["X-RateLimit-Remaining"]).toBe("0");
  });

  it("never emits Retry-After below 1 second", () => {
    const init = rateLimitedResponseInit({
      allowed: false,
      limit: 1,
      remaining: 0,
      retryAfterMs: 10,
      resetMs: 10,
    });
    expect(init.headers["Retry-After"]).toBe("1");
  });
});
