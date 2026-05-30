import { describe, it, expect } from "vitest";
import { estimateCost, estimateCostLabel, formatUsd, rateForModel, billingModeForProvider } from "./pricing";

describe("rateForModel", () => {
  it("resolves canonical ids and short aliases", () => {
    expect(rateForModel("claude-opus-4-8")).toMatchObject({ inputPerMTok: 15, outputPerMTok: 75 });
    expect(rateForModel("sonnet")).toMatchObject({ inputPerMTok: 3 });
    expect(rateForModel("claude-haiku-4.5")).toEqual(rateForModel("claude-haiku-4-5"));
  });

  it("returns null for unknown / missing models", () => {
    expect(rateForModel("nonexistent-model")).toBeNull();
    expect(rateForModel(null)).toBeNull();
  });
});

describe("billingModeForProvider", () => {
  it("maps providers to billing modes", () => {
    expect(billingModeForProvider("anthropic_api")).toBe("metered");
    expect(billingModeForProvider("codex_cli")).toBe("subscription");
    expect(billingModeForProvider("ollama")).toBe("local");
    expect(billingModeForProvider("deterministic")).toBe("free");
    expect(billingModeForProvider("unknown")).toBe("metered"); // best-effort default
  });
});

describe("formatUsd", () => {
  it("scales precision with magnitude", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(2.5)).toBe("$2.50");
    expect(formatUsd(0.0123)).toBe("$0.0123");
    expect(formatUsd(0.000123)).toBe("$0.000123");
  });
});

describe("estimateCost", () => {
  it("returns null when no tokens were recorded", () => {
    expect(estimateCost({ provider: "anthropic_api", model: "claude-opus-4-8", inputTokens: 0, outputTokens: 0 })).toBeNull();
  });

  it("computes a real metered USD cost for API providers", () => {
    // 1M in @ $15 + 1M out @ $75 = $90.00
    const est = estimateCost({ provider: "anthropic_api", model: "claude-opus-4-8", inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(est?.mode).toBe("metered");
    expect(est?.usd).toBeCloseTo(90, 5);
    expect(est?.label).toContain("$90.00");
  });

  it("treats CLI providers as subscription with an API-equivalent figure", () => {
    const est = estimateCost({ provider: "codex_cli", model: "gpt-5.5", inputTokens: 1_000_000, outputTokens: 0 });
    expect(est?.mode).toBe("subscription");
    expect(est?.usd).toBeNull();
    expect(est?.equivalentUsd).toBeCloseTo(1.25, 5);
    expect(est?.label).toContain("subscription");
  });

  it("reports local providers as zero marginal cost", () => {
    const est = estimateCost({ provider: "ollama", model: "llama3:latest", inputTokens: 5000, outputTokens: 5000 });
    expect(est?.mode).toBe("local");
    expect(est?.usd).toBe(0);
    expect(est?.label).toContain("$0");
  });

  it("reports deterministic providers as free", () => {
    const est = estimateCost({ provider: "deterministic", model: "evidence-derived", inputTokens: 10, outputTokens: 10 });
    expect(est?.mode).toBe("free");
    expect(est?.usd).toBe(0);
  });

  it("falls back to a token-count estimate when the model rate is unknown", () => {
    const est = estimateCost({ provider: "anthropic_api", model: "mystery-model", inputTokens: 100, outputTokens: 50 });
    expect(est?.usd).toBeNull();
    expect(est?.label).toContain("150 tokens");
  });
});

describe("estimateCostLabel", () => {
  it("returns just the string, or null", () => {
    expect(estimateCostLabel({ inputTokens: 0, outputTokens: 0 })).toBeNull();
    expect(estimateCostLabel({ provider: "anthropic_api", model: "claude-sonnet-4-6", inputTokens: 1_000_000, outputTokens: 0 })).toContain("$3.00");
  });
});
