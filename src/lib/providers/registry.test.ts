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
  validateAgentProvider,
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

  it("LLM agents default to Codex CLI with Claude CLI retry fallback", () => {
    for (const agentName of LLM_AGENT_NAMES) {
      const agent = AGENT_DEFAULTS.find((item) => item.agentName === agentName);
      expect(agent?.providerId).toBe("codex_cli");
      expect(agent?.model).toBe("gpt-5.5");
      expect(agent?.fallbackProvider).toBe("claude_cli");
      expect(agent?.fallbackStrategy).toBe("retry");
    }
  });

  it("orchestrator + validator keep high reasoning on Codex defaults", () => {
    const orchestrator = AGENT_DEFAULTS.find((a) => a.agentName === "orchestrator");
    const validator = AGENT_DEFAULTS.find((a) => a.agentName === "validator");
    expect(orchestrator?.providerId).toBe("codex_cli");
    expect(orchestrator?.model).toBe("gpt-5.5");
    expect(orchestrator?.reasoningBudget).toBe("high");
    expect(validator?.providerId).toBe("codex_cli");
    expect(validator?.model).toBe("gpt-5.5");
    expect(validator?.reasoningBudget).toBe("high");
  });

  it("evidence-derived stages default to the deterministic provider (no LLM, 0 tokens, no fallback)", () => {
    for (const name of ["repo-scanner", "git-evidence", "skill-graph"] as const) {
      const a = AGENT_DEFAULTS.find((x) => x.agentName === name);
      expect(a?.providerId).toBe("deterministic");
      expect(a?.model).toBe(name);
      expect(a?.reasoningBudget).toBe("none");
      expect(a?.maxTokens).toBe(0);
      expect(a?.fallbackProvider).toBeNull();
      expect(a?.fallbackStrategy).toBe("fail");
    }
  });

  it("agent defaults never reference the removed mock provider", () => {
    for (const a of AGENT_DEFAULTS) {
      expect(a.fallbackProvider).not.toBe("mock");
      expect(a.providerId).not.toBe("mock");
    }
  });

  it("only LLM stages carry an LLM fallback; deterministic stages fail closed", () => {
    for (const a of AGENT_DEFAULTS) {
      if (a.providerId === "deterministic") {
        expect(a.fallbackProvider).toBeNull();
        expect(a.fallbackStrategy).toBe("fail");
      } else {
        expect(a.fallbackStrategy).toBe("retry");
      }
    }
  });

  it("validateAgentProvider fails closed on illegal provider/agent pairings", () => {
    // deterministic may only be set on the evidence-derived stages
    for (const name of ["architecture", "security", "testing", "validator"]) {
      expect(validateAgentProvider(name, "deterministic").ok).toBe(false);
    }
    for (const name of ["repo-scanner", "git-evidence", "skill-graph"]) {
      expect(validateAgentProvider(name, "deterministic").ok).toBe(true);
      // and an LLM provider may not be assigned to a deterministic stage
      expect(validateAgentProvider(name, "codex_cli").ok).toBe(false);
    }
    // normal LLM agent on an LLM provider is fine
    expect(validateAgentProvider("architecture", "codex_cli").ok).toBe(true);
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

  it("Ollama defaults to the gemma4 31b cloud model", () => {
    expect(PROVIDER_MODEL_DEFAULTS.ollama).toBe("gemma4:31b-cloud");
    expect(PROVIDER_MODEL_CATALOG.ollama).toContain("gemma4:31b-cloud");
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
