import { describe, it, expect, vi } from "vitest";
import { TtlMemo } from "./cache";

function memo(ttlMs: number) {
  let clock = 0;
  const m = new TtlMemo({ ttlMs, now: () => clock });
  return { m, advance: (ms: number) => (clock += ms) };
}

describe("TtlMemo", () => {
  it("serves a cache hit within the TTL (loader runs once)", async () => {
    const { m } = memo(1000);
    const loader = vi.fn(async () => "v1");

    const a = await m.getOrLoad("k", loader);
    const b = await m.getOrLoad("k", loader);

    expect(a).toBe("v1");
    expect(b).toBe("v1");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("reloads after the TTL expires", async () => {
    const { m, advance } = memo(1000);
    const loader = vi.fn().mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");

    expect(await m.getOrLoad("k", loader)).toBe("v1");
    advance(999);
    expect(await m.getOrLoad("k", loader)).toBe("v1"); // still fresh
    advance(2);
    expect(await m.getOrLoad("k", loader)).toBe("v2"); // expired → reload
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("reloads after invalidation, even within the TTL", async () => {
    const { m } = memo(10_000);
    const loader = vi.fn().mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");

    expect(await m.getOrLoad("k", loader)).toBe("v1");
    m.invalidate(); // simulates a config write busting the memo
    expect(await m.getOrLoad("k", loader)).toBe("v2");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("de-dupes concurrent callers onto one in-flight load", async () => {
    const { m } = memo(1000);
    const loader = vi.fn(() => new Promise((r) => setTimeout(() => r("v1"), 5)));

    const [a, b] = await Promise.all([m.getOrLoad("k", loader), m.getOrLoad("k", loader)]);

    expect(a).toBe("v1");
    expect(b).toBe("v1");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("evicts a rejected load so the next call retries", async () => {
    const { m } = memo(1000);
    const loader = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("v2");

    await expect(m.getOrLoad("k", loader)).rejects.toThrow("boom");
    expect(await m.getOrLoad("k", loader)).toBe("v2");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("scopes entries by key", async () => {
    const { m } = memo(1000);
    expect(await m.getOrLoad("a", async () => "A")).toBe("A");
    expect(await m.getOrLoad("b", async () => "B")).toBe("B");
    m.invalidate("a");
    expect(m.size).toBe(1);
    expect(await m.getOrLoad("b", async () => "B2")).toBe("B"); // b still cached
  });

  it("ttlMs=0 disables caching", async () => {
    const m = new TtlMemo({ ttlMs: 0 });
    const loader = vi.fn().mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");
    expect(await m.getOrLoad("k", loader)).toBe("v1");
    expect(await m.getOrLoad("k", loader)).toBe("v2");
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
