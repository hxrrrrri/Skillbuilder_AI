import { describe, it, expect } from "vitest";
import {
  AGENT_TOKEN_BUDGETS,
  budgetForAgent,
  isDeterministicBudget,
  truncateToBudget,
  estimateTokensFromText,
  buildRuntimeAccounting,
} from "./token-budget";
import { LLM_AGENT_NAMES, DETERMINISTIC_AGENT_NAMES } from "./providers/defaults";

describe("token budgets", () => {
  it("covers every LLM and deterministic agent", () => {
    for (const name of [...LLM_AGENT_NAMES, ...DETERMINISTIC_AGENT_NAMES]) {
      expect(AGENT_TOKEN_BUDGETS[name]).toBeDefined();
    }
  });

  it("deterministic stages spend zero LLM tokens", () => {
    for (const name of DETERMINISTIC_AGENT_NAMES) {
      const b = budgetForAgent(name);
      expect(b.maxInputTokens).toBe(0);
      expect(b.maxOutputTokens).toBe(0);
      expect(b.modelTier).toBe("deterministic");
      expect(isDeterministicBudget(b)).toBe(true);
    }
  });

  it("orchestrator and validator use the strong tier with the largest budgets", () => {
    expect(budgetForAgent("orchestrator").modelTier).toBe("strong");
    expect(budgetForAgent("validator").modelTier).toBe("strong");
    expect(budgetForAgent("validator").maxInputTokens).toBeGreaterThanOrEqual(
      budgetForAgent("architecture").maxInputTokens,
    );
  });

  it("security escalates to strong only when risk is flagged", () => {
    expect(budgetForAgent("security").modelTier).toBe("balanced");
    expect(budgetForAgent("security", { securityRiskFlagged: true }).modelTier).toBe("strong");
  });

  it("budgetForAgent returns a fresh object (no shared mutation)", () => {
    const a = budgetForAgent("documentation");
    a.maxInputTokens = 1;
    expect(AGENT_TOKEN_BUDGETS.documentation.maxInputTokens).not.toBe(1);
  });

  it("truncates over-budget context deterministically and flags it", () => {
    const big = "x".repeat(10_000);
    const { text, truncated } = truncateToBudget(big, 100); // 100 tokens ≈ 400 chars
    expect(truncated).toBe(true);
    expect(text.length).toBe(400);
    const small = truncateToBudget("hello", 100);
    expect(small.truncated).toBe(false);
    expect(small.text).toBe("hello");
    // zero budget truncates everything
    expect(truncateToBudget("anything", 0)).toEqual({ text: "", truncated: true });
  });

  it("runtime accounting reports budget overruns and compression ratio", () => {
    const budget = budgetForAgent("architecture");
    const under = buildRuntimeAccounting({
      agentName: "architecture",
      budget,
      estimatedInputTokens: 1000,
      actualOutputTokens: 400,
    });
    expect(under.budgetExceeded).toBe(false);
    expect(under.compressionRatio).toBeLessThan(1);
    expect(under.contextStrategy).toBe("focused");

    const over = buildRuntimeAccounting({
      agentName: "architecture",
      budget,
      estimatedInputTokens: budget.maxInputTokens + 1,
      actualOutputTokens: 0,
    });
    expect(over.budgetExceeded).toBe(true);
  });

  it("estimateTokensFromText is a stable char/4 estimate", () => {
    expect(estimateTokensFromText("")).toBe(0);
    expect(estimateTokensFromText("abcd")).toBe(1);
    expect(estimateTokensFromText("abcde")).toBe(2);
  });
});
