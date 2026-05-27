import { describe, it, expect } from "vitest";
import {
  PROVIDER_DEFAULTS,
  AGENT_DEFAULTS,
  AGENT_NAMES,
  FALLBACK_STRATEGIES,
  COST_TIERS,
  QUALITY_TIERS,
  isFallbackStrategy,
  isCostTier,
  isQualityTier,
} from "./registry";

describe("registry defaults shape", () => {
  it("provider defaults cover every ProviderId we ship", () => {
    const ids = PROVIDER_DEFAULTS.map((p) => p.providerId).sort();
    expect(ids).toEqual(
      ["anthropic_api", "claude_cli", "codex_cli", "copilot_cli", "mock", "ollama"].sort(),
    );
  });

  it("agent defaults cover every name in AGENT_NAMES", () => {
    const defaultNames = AGENT_DEFAULTS.map((a) => a.agentName).sort();
    const expected = [...AGENT_NAMES].sort();
    expect(defaultNames).toEqual(expected);
  });

  it("orchestrator + validator default to high reasoning Opus", () => {
    const orchestrator = AGENT_DEFAULTS.find((a) => a.agentName === "orchestrator");
    const validator = AGENT_DEFAULTS.find((a) => a.agentName === "validator");
    expect(orchestrator?.providerId).toBe("anthropic_api");
    expect(orchestrator?.model).toBe("claude-opus-4-7");
    expect(orchestrator?.reasoningBudget).toBe("high");
    expect(validator?.providerId).toBe("anthropic_api");
    expect(validator?.model).toBe("claude-opus-4-7");
    expect(validator?.reasoningBudget).toBe("high");
  });

  it("deterministic stages (repo-scanner, git-evidence, skill-graph) default to mock with reasoning=none", () => {
    for (const name of ["repo-scanner", "git-evidence", "skill-graph"] as const) {
      const a = AGENT_DEFAULTS.find((x) => x.agentName === name);
      expect(a?.providerId).toBe("mock");
      expect(a?.reasoningBudget).toBe("none");
    }
  });

  it("agent defaults declare a fallback (or explicit null for deterministic stages)", () => {
    for (const a of AGENT_DEFAULTS) {
      if (["repo-scanner", "git-evidence", "skill-graph"].includes(a.agentName)) {
        expect(a.fallbackProvider).toBeNull();
      } else {
        expect(a.fallbackProvider).not.toBeNull();
      }
    }
  });

  it("every agent's providerId points at a known provider", () => {
    const knownIds = new Set(PROVIDER_DEFAULTS.map((p) => p.providerId));
    for (const a of AGENT_DEFAULTS) {
      expect(knownIds.has(a.providerId)).toBe(true);
      if (a.fallbackProvider) {
        expect(knownIds.has(a.fallbackProvider)).toBe(true);
      }
    }
  });
});

describe("registry validators", () => {
  it("FALLBACK_STRATEGIES / COST_TIERS / QUALITY_TIERS narrowing", () => {
    expect(isFallbackStrategy("mock")).toBe(true);
    expect(isFallbackStrategy("ignore")).toBe(false);
    expect(isCostTier("low")).toBe(true);
    expect(isCostTier("extreme")).toBe(false);
    expect(isQualityTier("high")).toBe(true);
    expect(isQualityTier("HIGH")).toBe(false);
  });

  it("enum lists are stable", () => {
    expect(FALLBACK_STRATEGIES).toEqual(["mock", "retry", "skip"]);
    expect(COST_TIERS).toEqual(["low", "medium", "high"]);
    expect(QUALITY_TIERS).toEqual(["low", "medium", "high"]);
  });
});
