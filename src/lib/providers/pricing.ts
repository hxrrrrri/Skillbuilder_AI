// Per-provider / per-model token cost estimation.
//
// Replaces the old `estimated tokens N` placeholder with a real dollar estimate.
// Rates are public list prices (USD per 1,000,000 tokens) and are intentionally
// labeled "est." — they are a planning aid, not a billing record. Billing mode is
// provider-aware: API providers are metered per token, CLI providers are billed by
// a flat subscription (so the per-token figure is shown only as an API-equivalent),
// and local/deterministic providers have no marginal model cost.

export type BillingMode = "metered" | "subscription" | "local" | "free";

export type ModelRate = { inputPerMTok: number; outputPerMTok: number };

/** USD per 1,000,000 tokens. List-price estimates — update as vendors change them. */
export const MODEL_PRICING_USD: Record<string, ModelRate> = {
  // Anthropic Claude families.
  "claude-opus-4-8": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-opus-4-7": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-opus-4-6": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5": { inputPerMTok: 0.8, outputPerMTok: 4 },
  // OpenAI / Codex (gpt-5.5 class) — estimate until a published rate exists.
  "gpt-5.5": { inputPerMTok: 1.25, outputPerMTok: 10 },
};

/** Map vendor/CLI short names onto a canonical priced model id. */
const MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
  "claude-haiku-4.5": "claude-haiku-4-5",
};

const PROVIDER_BILLING: Record<string, BillingMode> = {
  anthropic_api: "metered",
  claude_cli: "subscription",
  codex_cli: "subscription",
  copilot_cli: "subscription",
  ollama: "local",
  deterministic: "free",
};

export function rateForModel(model: string | null | undefined): ModelRate | null {
  if (!model) return null;
  const key = MODEL_ALIASES[model] ?? model;
  return MODEL_PRICING_USD[key] ?? null;
}

export function billingModeForProvider(provider: string | null | undefined): BillingMode {
  if (!provider) return "metered";
  return PROVIDER_BILLING[provider] ?? "metered";
}

function usdFromRate(rate: ModelRate, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * rate.inputPerMTok + (outputTokens / 1_000_000) * rate.outputPerMTok;
}

/** Compact USD formatting that keeps small estimates readable. */
export function formatUsd(n: number): string {
  if (n <= 0) return "$0";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

export type CostEstimate = {
  mode: BillingMode;
  /** Metered cost actually billed for this call (null when not per-token billed). */
  usd: number | null;
  /** API-equivalent cost for subscription/local providers (transparency only). */
  equivalentUsd: number | null;
  rate: ModelRate | null;
  model: string | null;
  provider: string | null;
  inputTokens: number;
  outputTokens: number;
  /** Human-readable summary for the admin UI. */
  label: string;
};

export function estimateCost(params: {
  provider?: string | null;
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
}): CostEstimate | null {
  const inputTokens = Number(params.inputTokens) || 0;
  const outputTokens = Number(params.outputTokens) || 0;
  if (!inputTokens && !outputTokens) return null;

  const provider = params.provider ?? null;
  const model = params.model ?? null;
  const mode = billingModeForProvider(provider);
  const rate = rateForModel(model);
  const total = inputTokens + outputTokens;
  const computed = rate ? usdFromRate(rate, inputTokens, outputTokens) : null;

  const base: Omit<CostEstimate, "usd" | "equivalentUsd" | "label"> = {
    mode,
    rate,
    model,
    provider,
    inputTokens,
    outputTokens,
  };

  switch (mode) {
    case "free":
      return { ...base, usd: 0, equivalentUsd: null, label: "$0 · no model cost" };
    case "local":
      return {
        ...base,
        usd: 0,
        equivalentUsd: computed,
        label: computed != null ? `local · $0 (~${formatUsd(computed)} API-equiv)` : `local · $0 (${total} tok)`,
      };
    case "subscription":
      return {
        ...base,
        usd: null,
        equivalentUsd: computed,
        label: computed != null ? `subscription · ~${formatUsd(computed)} API-equiv (est.)` : `subscription · ${total} tok`,
      };
    case "metered":
    default:
      return computed != null
        ? { ...base, usd: computed, equivalentUsd: null, label: `~${formatUsd(computed)} · ${model} (est.)` }
        : { ...base, usd: null, equivalentUsd: null, label: `est. ${total} tokens · no rate for ${model ?? "model"}` };
  }
}

/** Convenience: the UI string only, or null when there is nothing to estimate. */
export function estimateCostLabel(params: {
  provider?: string | null;
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
}): string | null {
  return estimateCost(params)?.label ?? null;
}
