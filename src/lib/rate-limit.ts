// In-memory token-bucket rate limiter.
//
// Keyed by a caller-supplied string (userId, falling back to client IP). The
// public surface is the `RateLimiter` interface so a Redis/Upstash-backed
// implementation can be swapped in later without touching call sites — route
// handlers depend only on `consume()` + `RateLimitResult`.
//
// Limitation: buckets live in process memory, so each serverless instance keeps
// its own counts. That is intentional for the single-node demo/worker topology;
// move to a shared store (Redis) before scaling out web replicas.

export type RateLimitConfig = {
  /** Max tokens in the bucket (burst capacity). */
  max: number;
  /** Window over which `max` tokens fully refill, in milliseconds. */
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Configured burst capacity (max). */
  limit: number;
  /** Whole tokens left after this call. */
  remaining: number;
  /** ms until enough tokens exist to retry (0 when allowed). */
  retryAfterMs: number;
  /** ms until the bucket is fully refilled. */
  resetMs: number;
};

export interface RateLimiter {
  /** Attempt to spend `cost` tokens for `key`. Never throws. */
  consume(key: string, cost?: number): RateLimitResult;
  /** Reset one key, or all keys when `key` is omitted (test/ops helper). */
  reset(key?: string): void;
}

type Bucket = { tokens: number; updatedAt: number };

// Drop idle buckets once the map grows past this, so a flood of distinct keys
// (e.g. spoofed IPs) cannot leak memory unbounded.
const MAX_TRACKED_KEYS = 10_000;

export class TokenBucketRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly disabled: boolean;

  constructor(config: RateLimitConfig, opts: { now?: () => number; disabled?: boolean } = {}) {
    this.capacity = Math.max(1, config.max);
    this.windowMs = Math.max(1, config.windowMs);
    this.refillPerMs = this.capacity / this.windowMs;
    this.now = opts.now ?? Date.now;
    this.disabled = opts.disabled ?? false;
  }

  consume(key: string, cost = 1): RateLimitResult {
    if (this.disabled) {
      return { allowed: true, limit: this.capacity, remaining: this.capacity, retryAfterMs: 0, resetMs: 0 };
    }
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };

    // Refill proportional to elapsed time, capped at capacity.
    const elapsed = Math.max(0, now - bucket.updatedAt);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerMs);
    bucket.updatedAt = now;

    let allowed: boolean;
    let retryAfterMs: number;
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      allowed = true;
      retryAfterMs = 0;
    } else {
      allowed = false;
      retryAfterMs = Math.ceil((cost - bucket.tokens) / this.refillPerMs);
    }

    this.buckets.set(key, bucket);
    if (this.buckets.size > MAX_TRACKED_KEYS) this.prune(now);

    const resetMs = Math.ceil((this.capacity - bucket.tokens) / this.refillPerMs);
    return {
      allowed,
      limit: this.capacity,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      retryAfterMs,
      resetMs,
    };
  }

  reset(key?: string): void {
    if (key === undefined) this.buckets.clear();
    else this.buckets.delete(key);
  }

  // Drop fully-refilled (idle) buckets; they carry no state worth keeping.
  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      const refilled = bucket.tokens + (now - bucket.updatedAt) * this.refillPerMs;
      if (refilled >= this.capacity) this.buckets.delete(key);
    }
  }
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const RATE_LIMIT_DISABLED = process.env.RATE_LIMIT_DISABLED === "1";

function configuredLimiter(prefix: string, defaults: RateLimitConfig): TokenBucketRateLimiter {
  return new TokenBucketRateLimiter(
    {
      max: intEnv(`RATE_LIMIT_${prefix}_MAX`, defaults.max),
      windowMs: intEnv(`RATE_LIMIT_${prefix}_WINDOW_MS`, defaults.windowMs),
    },
    { disabled: RATE_LIMIT_DISABLED },
  );
}

// Singletons stashed on globalThis so Next.js dev hot-reload / route module
// re-evaluation does not wipe live buckets (mirrors src/lib/db.ts).
type LimiterMap = {
  analyze: TokenBucketRateLimiter;
  register: TokenBucketRateLimiter;
  interview: TokenBucketRateLimiter;
  challenge: TokenBucketRateLimiter;
  chat: TokenBucketRateLimiter;
};

const g = globalThis as unknown as { __skillproofRateLimiters?: LimiterMap };

export const RATE_LIMITS: LimiterMap =
  g.__skillproofRateLimiters ??
  (g.__skillproofRateLimiters = {
    // Strictest: each analyze clones a repo + fires the full agent pipeline.
    analyze: configuredLimiter("ANALYZE", { max: 5, windowMs: 5 * 60_000 }),
    // Anti-abuse on account creation, keyed by IP.
    register: configuredLimiter("REGISTER", { max: 10, windowMs: 60 * 60_000 }),
    // One LLM evaluation per call.
    interview: configuredLimiter("INTERVIEW", { max: 30, windowMs: 5 * 60_000 }),
    // LLM evaluation + workspace diff application.
    challenge: configuredLimiter("CHALLENGE", { max: 15, windowMs: 5 * 60_000 }),
    // Copilot chat turns — one provider call each; keep generous but abuse-resistant.
    chat: configuredLimiter("CHAT", { max: 30, windowMs: 5 * 60_000 }),
  });

/** First hop of x-forwarded-for, then x-real-ip, else "unknown". */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Prefer authenticated userId; fall back to client IP for anonymous callers. */
export function rateLimitKey(req: Request, userId?: string | null): string {
  return userId ? `user:${userId}` : `ip:${clientIp(req)}`;
}

/**
 * Plain (framework-agnostic) 429 payload + headers. Routes wrap this with
 * NextResponse.json(body, init) so this module stays free of next/server.
 */
export function rateLimitedResponseInit(result: RateLimitResult): {
  status: 429;
  body: { error: "rate_limited"; message: string; retry_after_seconds: number };
  headers: Record<string, string>;
} {
  const retryAfter = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  return {
    status: 429,
    body: {
      error: "rate_limited",
      message: "Too many requests. Slow down and retry after the indicated delay.",
      retry_after_seconds: retryAfter,
    },
    headers: {
      "Retry-After": String(retryAfter),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
    },
  };
}
