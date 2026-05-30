// Per-agent token budgets and context strategy.
//
// This is the single source of truth for how much input/output token spend each
// agent is allowed and which context-selection strategy + model tier it should
// use. The pipeline reads these to (a) cap the context it assembles per agent
// (see src/lib/agent-context/select-context.ts), (b) cap maxTokens on the
// provider call, and (c) record planned-vs-actual token accounting in the
// provider matrix runtime so the admin can see compression honestly.
//
// Deterministic stages (repo-scanner/git-evidence/skill-graph) spend ZERO LLM
// tokens — their budget is 0/0 and modelTier "deterministic".

export type ContextStrategy = "minimal" | "focused" | "broad" | "validator" | "none";
export type ModelTier = "deterministic" | "cheap" | "balanced" | "strong";

export type AgentTokenBudget = {
  maxInputTokens: number;
  maxOutputTokens: number;
  contextStrategy: ContextStrategy;
  modelTier: ModelTier;
};

// Approx chars-per-token used for deterministic estimation across the codebase.
export const CHARS_PER_TOKEN = 4;

const DETERMINISTIC: AgentTokenBudget = {
  maxInputTokens: 0,
  maxOutputTokens: 0,
  contextStrategy: "none",
  modelTier: "deterministic",
};

/**
 * Budgets per agent. Values follow the product spec: orchestrator and validator
 * get the most room and the strongest tier; workers are lean; documentation /
 * authenticity / improvement-plan are cheap; deterministic stages are 0/0.
 */
export const AGENT_TOKEN_BUDGETS: Record<string, AgentTokenBudget> = {
  orchestrator: { maxInputTokens: 1200, maxOutputTokens: 1200, contextStrategy: "focused", modelTier: "strong" },
  architecture: { maxInputTokens: 2500, maxOutputTokens: 900, contextStrategy: "focused", modelTier: "balanced" },
  "code-quality": { maxInputTokens: 2200, maxOutputTokens: 900, contextStrategy: "focused", modelTier: "balanced" },
  testing: { maxInputTokens: 1800, maxOutputTokens: 700, contextStrategy: "focused", modelTier: "balanced" },
  // Security upgrades to "strong" only when secret/risk flags are present — see budgetForAgent().
  security: { maxInputTokens: 1800, maxOutputTokens: 700, contextStrategy: "focused", modelTier: "balanced" },
  "ai-collaboration": { maxInputTokens: 1200, maxOutputTokens: 600, contextStrategy: "minimal", modelTier: "balanced" },
  documentation: { maxInputTokens: 1200, maxOutputTokens: 600, contextStrategy: "minimal", modelTier: "cheap" },
  authenticity: { maxInputTokens: 1200, maxOutputTokens: 600, contextStrategy: "minimal", modelTier: "balanced" },
  "interview-gen": { maxInputTokens: 1600, maxOutputTokens: 900, contextStrategy: "focused", modelTier: "balanced" },
  "answer-evaluator": { maxInputTokens: 1600, maxOutputTokens: 700, contextStrategy: "focused", modelTier: "balanced" },
  "ai-collaboration-evaluator": { maxInputTokens: 1400, maxOutputTokens: 700, contextStrategy: "focused", modelTier: "balanced" },
  validator: { maxInputTokens: 3500, maxOutputTokens: 1400, contextStrategy: "validator", modelTier: "strong" },
  "profile-gen": { maxInputTokens: 2500, maxOutputTokens: 1200, contextStrategy: "broad", modelTier: "balanced" },
  "employer-verifier": { maxInputTokens: 2200, maxOutputTokens: 900, contextStrategy: "broad", modelTier: "balanced" },
  "improvement-plan": { maxInputTokens: 1800, maxOutputTokens: 800, contextStrategy: "focused", modelTier: "cheap" },
  // Deterministic stages — zero LLM spend.
  "repo-scanner": DETERMINISTIC,
  "git-evidence": DETERMINISTIC,
  "skill-graph": DETERMINISTIC,
};

const DEFAULT_BUDGET: AgentTokenBudget = {
  maxInputTokens: 1800,
  maxOutputTokens: 800,
  contextStrategy: "focused",
  modelTier: "balanced",
};

export type BudgetSignals = {
  /** Security escalates to a strong model when secrets/high-risk are flagged. */
  securityRiskFlagged?: boolean;
};

/**
 * Resolve the budget for an agent, applying dynamic signals. Returns a fresh
 * object (never the shared constant) so callers can annotate it safely.
 */
export function budgetForAgent(agentName: string, signals: BudgetSignals = {}): AgentTokenBudget {
  const base = AGENT_TOKEN_BUDGETS[agentName] ?? DEFAULT_BUDGET;
  const budget: AgentTokenBudget = { ...base };
  if (agentName === "security" && signals.securityRiskFlagged) {
    budget.modelTier = "strong";
  }
  return budget;
}

export function isDeterministicBudget(budget: AgentTokenBudget): boolean {
  return budget.modelTier === "deterministic" && budget.maxInputTokens === 0 && budget.maxOutputTokens === 0;
}

/** Deterministic char→token estimate, matching the rest of the token metering. */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Deterministically truncate text to fit an input-token budget. Truncation is
 * marked so downstream accounting can flag a budget overrun rather than hide it.
 */
export function truncateToBudget(text: string, maxInputTokens: number): { text: string; truncated: boolean } {
  const maxChars = Math.max(0, maxInputTokens) * CHARS_PER_TOKEN;
  if (maxChars === 0) return { text: "", truncated: text.length > 0 };
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

export type AgentRuntimeAccounting = {
  agentName: string;
  plannedInputTokens: number;
  plannedOutputTokens: number;
  estimatedInputTokens: number;
  actualOutputTokens: number;
  budgetExceeded: boolean;
  /** estimatedInput / plannedInput (capped at 9.99); <1 means under budget. */
  compressionRatio: number;
  contextStrategy: ContextStrategy;
  modelTier: ModelTier;
  modelReason: string;
};

/** Build the runtime accounting record persisted into the provider matrix. */
export function buildRuntimeAccounting(opts: {
  agentName: string;
  budget: AgentTokenBudget;
  estimatedInputTokens: number;
  actualOutputTokens: number;
  modelReason?: string;
}): AgentRuntimeAccounting {
  const { agentName, budget, estimatedInputTokens, actualOutputTokens } = opts;
  const ratio =
    budget.maxInputTokens > 0 ? Math.min(9.99, estimatedInputTokens / budget.maxInputTokens) : 0;
  return {
    agentName,
    plannedInputTokens: budget.maxInputTokens,
    plannedOutputTokens: budget.maxOutputTokens,
    estimatedInputTokens,
    actualOutputTokens,
    budgetExceeded:
      estimatedInputTokens > budget.maxInputTokens || actualOutputTokens > budget.maxOutputTokens,
    compressionRatio: Number(ratio.toFixed(3)),
    contextStrategy: budget.contextStrategy,
    modelTier: budget.modelTier,
    modelReason: opts.modelReason ?? `${budget.modelTier} tier per token budget for ${agentName}`,
  };
}
