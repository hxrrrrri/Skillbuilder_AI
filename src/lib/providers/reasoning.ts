/**
 * Generic reasoning-budget abstraction.
 *
 * Different providers expose "thinking effort" / "reasoning budget" differently:
 * - Anthropic exposes a `thinking` block with a token budget (extended thinking).
 * - OpenAI's o-series exposes `reasoning.effort: low|medium|high`.
 * - CLI tools (claude, codex, copilot) usually expose flags that are not stable
 *   across versions; we map to no-op for now.
 * - Ollama models do not expose reasoning effort.
 * - The mock provider ignores reasoning.
 *
 * The internal abstraction is a 5-step ladder; each provider adapter calls
 * `mapReasoningBudget(providerId, budget)` to get either provider-native
 * controls or `null` (not supported / no-op).
 */

import type { ProviderId } from "./types";

export const REASONING_BUDGETS = ["none", "low", "medium", "high", "max"] as const;
export type ReasoningBudget = (typeof REASONING_BUDGETS)[number];

export function isReasoningBudget(value: unknown): value is ReasoningBudget {
  return typeof value === "string" && (REASONING_BUDGETS as readonly string[]).includes(value);
}

const ANTHROPIC_THINKING_TOKENS: Record<ReasoningBudget, number | null> = {
  none: null,
  low: 1024,
  medium: 4096,
  high: 16384,
  max: 32768,
};

const OPENAI_EFFORT: Record<ReasoningBudget, "minimal" | "low" | "medium" | "high" | null> = {
  none: null,
  low: "low",
  medium: "medium",
  high: "high",
  max: "high",
};

export type ProviderReasoningMapping =
  | { kind: "anthropic_thinking"; budgetTokens: number | null }
  | { kind: "openai_effort"; effort: "minimal" | "low" | "medium" | "high" | null }
  | { kind: "unsupported"; reason: string };

const UNSUPPORTED: Record<string, string> = {
  claude_cli: "CLI flags drift across versions; reasoning is delegated to the CLI binary.",
  codex_cli: "CLI does not stably expose reasoning effort.",
  copilot_cli: "Reasoning effort not supported by this CLI.",
  ollama: "Ollama does not expose reasoning effort.",
  mock: "Mock provider does not reason.",
};

export function mapReasoningBudget(providerId: ProviderId, budget: ReasoningBudget): ProviderReasoningMapping {
  if (providerId === "anthropic_api") {
    return { kind: "anthropic_thinking", budgetTokens: ANTHROPIC_THINKING_TOKENS[budget] };
  }
  // OpenAI provider not yet wired in this codebase but supported by the abstraction
  // for future migration. Keep the mapping function so a single source of truth exists.
  if ((providerId as string) === "openai_api") {
    return { kind: "openai_effort", effort: OPENAI_EFFORT[budget] };
  }
  return { kind: "unsupported", reason: UNSUPPORTED[providerId] ?? "Provider does not expose reasoning effort." };
}

export function reasoningSupportedByProvider(providerId: ProviderId): boolean {
  return providerId === "anthropic_api" || (providerId as string) === "openai_api";
}
