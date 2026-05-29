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
import { LLM_AGENT_NAMES, PROVIDER_MODEL_DEFAULTS } from "./defaults";
import { PROVIDER_MODEL_CATALOG } from "./model-catalog";

describe("registry defaults shape", () => {
  it("provider defaults cover every ProviderId we ship", () => {
    const ids = PROVIDER_DEFAULTS.map((p) => p.providerId).sort();
    expect(ids).toEqual(
      ["anthropic_api", "claude_cli", "codex_cli", "copilot_cli", "deterministic", "ollama"].sort(),
    );
    expect(ids).not.toContain("mock");
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
    expect(orchestrator?.model).toBe("claude-opus-4-8");
    expect(orchestrator?.reasoningBudget).toBe("high");
    expect(validator?.providerId).toBe("anthropic_api");
    expect(validator?.model).toBe("claude-opus-4-8");
    expect(validator?.reasoningBudget).toBe("high");
  });

  it("deterministic stages (repo-scanner, git-evidence, skill-graph) default to deterministic with reasoning=none", () => {
    for (const name of ["repo-scanner", "git-evidence", "skill-graph"] as const) {
      const a = AGENT_DEFAULTS.find((x) => x.agentName === name);
      expect(a?.providerId).toBe("deterministic");
      expect(a?.reasoningBudget).toBe("none");
    }
  });

  it("agent defaults declare a fallback (or explicit null for deterministic stages)", () => {
    for (const a of AGENT_DEFAULTS) {
      if (["repo-scanner", "git-evidence", "skill-graph"].includes(a.agentName)) {
        expect(a.fallbackProvider).toBeNull();
      }
      expect(a.fallbackProvider).not.toBe("mock");
      expect(a.fallbackStrategy).toBe("fail");
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

  it("provider defaults and catalogs come from one consistent model table", () => {
    for (const provider of PROVIDER_DEFAULTS) {
      const configuredDefault = provider.defaultModel;
      if (!configuredDefault) continue;
      expect(PROVIDER_MODEL_DEFAULTS[provider.providerId]).toBe(configuredDefault);
      expect(PROVIDER_MODEL_CATALOG[provider.providerId]).toContain(configuredDefault);
    }
  });

  it("never assigns deterministic provider to LLM scoring agents", () => {
    for (const agentName of LLM_AGENT_NAMES) {
      const agent = AGENT_DEFAULTS.find((item) => item.agentName === agentName);
      expect(agent?.providerId).not.toBe("deterministic");
    }
  });
});

describe("registry validators", () => {
  it("FALLBACK_STRATEGIES / COST_TIERS / QUALITY_TIERS narrowing", () => {
    expect(isFallbackStrategy("fail")).toBe(true);
    expect(isFallbackStrategy("mock")).toBe(false);
    expect(isFallbackStrategy("ignore")).toBe(false);
    expect(isCostTier("low")).toBe(true);
    expect(isCostTier("extreme")).toBe(false);
    expect(isQualityTier("high")).toBe(true);
    expect(isQualityTier("HIGH")).toBe(false);
  });

  it("enum lists are stable", () => {
    expect(FALLBACK_STRATEGIES).toEqual(["retry", "fail", "skip_optional"]);
    expect(COST_TIERS).toEqual(["low", "medium", "high"]);
    expect(QUALITY_TIERS).toEqual(["low", "medium", "high"]);
  });
});

describe("deterministic provider runtime guard", () => {
  it("cannot generate LLM output", async () => {
    const { deterministicProvider } = await import("./deterministic");
    await expect(
      deterministicProvider.runJson({ system: "s", user: "u" }, '{"ok":boolean}'),
    ).rejects.toMatchObject({
      code: "provider_unsupported",
    });
  });
});
