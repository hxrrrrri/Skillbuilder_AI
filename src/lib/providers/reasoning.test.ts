import { describe, it, expect } from "vitest";
import {
  REASONING_BUDGETS,
  isReasoningBudget,
  mapReasoningBudget,
  reasoningSupportedByProvider,
} from "./reasoning";

describe("reasoning budget abstraction", () => {
  it("exposes 5 levels in ladder order", () => {
    expect(REASONING_BUDGETS).toEqual(["none", "low", "medium", "high", "max"]);
  });

  it("isReasoningBudget rejects unknown strings", () => {
    expect(isReasoningBudget("medium")).toBe(true);
    expect(isReasoningBudget("MEDIUM")).toBe(false);
    expect(isReasoningBudget("aggressive")).toBe(false);
    expect(isReasoningBudget(undefined)).toBe(false);
    expect(isReasoningBudget(3)).toBe(false);
  });
});

describe("reasoningSupportedByProvider", () => {
  it("returns true only for providers that expose reasoning effort", () => {
    expect(reasoningSupportedByProvider("anthropic_api")).toBe(true);
    expect(reasoningSupportedByProvider("claude_cli")).toBe(false);
    expect(reasoningSupportedByProvider("codex_cli")).toBe(false);
    expect(reasoningSupportedByProvider("copilot_cli")).toBe(false);
    expect(reasoningSupportedByProvider("ollama")).toBe(false);
    expect(reasoningSupportedByProvider("deterministic")).toBe(false);
  });
});

describe("mapReasoningBudget", () => {
  it("anthropic maps to thinking token budget on monotonic ladder", () => {
    const tokens = REASONING_BUDGETS.map((b) => {
      const m = mapReasoningBudget("anthropic_api", b);
      if (m.kind !== "anthropic_thinking") throw new Error("expected anthropic_thinking");
      return m.budgetTokens;
    });
    expect(tokens[0]).toBeNull(); // none → off
    expect(tokens[1]).toBe(1024);
    expect(tokens[2]).toBe(4096);
    expect(tokens[3]).toBe(16384);
    expect(tokens[4]).toBe(32768);
    // strictly increasing among the non-null levels
    for (let i = 2; i < tokens.length; i++) {
      expect((tokens[i] ?? 0) > (tokens[i - 1] ?? 0)).toBe(true);
    }
  });

  it.each(["claude_cli", "codex_cli", "copilot_cli", "ollama", "deterministic"] as const)(
    "%s reports unsupported with a reason",
    (provider) => {
      const m = mapReasoningBudget(provider, "high");
      expect(m.kind).toBe("unsupported");
      if (m.kind === "unsupported") {
        expect(m.reason.length).toBeGreaterThan(0);
      }
    },
  );

  it("anthropic 'none' returns null budgetTokens (off, not 0)", () => {
    const m = mapReasoningBudget("anthropic_api", "none");
    if (m.kind !== "anthropic_thinking") throw new Error("expected anthropic_thinking");
    expect(m.budgetTokens).toBeNull();
  });
});
