import { describe, expect, it } from "vitest";
import { computeCutoff } from "./audit-retention";

describe("computeCutoff", () => {
  it("returns N days before the given date", () => {
    const now = new Date("2026-05-27T00:00:00.000Z");
    const cutoff = computeCutoff(90, now);
    expect(cutoff.toISOString()).toBe("2026-02-26T00:00:00.000Z");
  });

  it("supports configurable retention", () => {
    const now = new Date("2026-05-27T12:00:00.000Z");
    const cutoff = computeCutoff(7, now);
    expect(cutoff.toISOString()).toBe("2026-05-20T12:00:00.000Z");
  });
});
