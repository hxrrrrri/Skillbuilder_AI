// In-process short-TTL memo for provider/agent registry reads + provider
// readiness checks.
//
// Why: every POST /api/analyze (plus selectProviderMatrix elsewhere) re-reads
// the provider/agent config from the DB and re-runs provider availability
// probes. Under a burst those repeat identical work per request. This memo
// collapses them to one load per short TTL window, and de-dupes concurrent
// callers onto a single in-flight promise.
//
// Correctness: the cache is cleared on every admin write to provider/agent
// config (see invalidateProviderRegistryCache wired into registry.ts), so stale
// config never outlives a change. The TTL is only the bound for changes that
// somehow bypass those write paths.
//
// Process-local (like the rate-limit + db singletons). Fine for the single-node
// demo/worker topology; a shared cache (Redis) would be needed before scaling
// web replicas — but staleness stays bounded by the short TTL regardless.

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Default memo lifetime. Tunable via PROVIDER_CACHE_TTL_MS (ms). */
export const PROVIDER_CACHE_TTL_MS = intEnv("PROVIDER_CACHE_TTL_MS", 10_000);

type Entry = { expiresAt: number; promise: Promise<unknown> };

export class TtlMemo {
  private readonly entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly disabled: boolean;

  constructor(opts: { ttlMs: number; now?: () => number; disabled?: boolean }) {
    this.ttlMs = Math.max(0, opts.ttlMs);
    this.now = opts.now ?? Date.now;
    this.disabled = opts.disabled ?? false;
  }

  /**
   * Return the cached promise for `key` if still fresh, otherwise run `loader`,
   * cache its promise, and return it. Concurrent callers within the window share
   * one in-flight promise. A rejected load is evicted so the next call retries
   * instead of caching the failure.
   */
  getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (this.disabled || this.ttlMs === 0) return loader();
    const now = this.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > now) return hit.promise as Promise<T>;

    const promise = loader();
    const entry: Entry = { expiresAt: now + this.ttlMs, promise };
    this.entries.set(key, entry);
    promise.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return promise;
  }

  /** Drop one key, or all keys when `key` is omitted. */
  invalidate(key?: string): void {
    if (key === undefined) this.entries.clear();
    else this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}

// Singleton stashed on globalThis so Next.js dev hot-reload / route module
// re-evaluation does not wipe the live cache (mirrors src/lib/db.ts).
// Disabled under Vitest so unit tests never see cross-test memo leakage; the
// memo class itself is exercised directly with an injected clock.
const g = globalThis as unknown as { __skillproofProviderCache?: TtlMemo };

export const providerCache: TtlMemo =
  g.__skillproofProviderCache ??
  (g.__skillproofProviderCache = new TtlMemo({
    ttlMs: PROVIDER_CACHE_TTL_MS,
    disabled: process.env.PROVIDER_CACHE_DISABLED === "1" || !!process.env.VITEST,
  }));

/** Clear all provider/agent/readiness memo entries. Call on any config write. */
export function invalidateProviderRegistryCache(): void {
  providerCache.invalidate();
}
