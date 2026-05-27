// Anthropic API provider — wraps existing llmCall.

import { extractJson, llmCall } from "@/lib/claude";
import type { LLMProvider, ProviderPrompt, ProviderResult } from "./types";
import { mapReasoningBudget } from "./reasoning";

export function makeAnthropicApiProvider(opts: { enabled?: boolean; defaultModel?: string | null } = {}): LLMProvider {
  return {
    id: "anthropic_api",
    label: "Anthropic API",
    async available() {
      return opts.enabled !== false && !!process.env.ANTHROPIC_API_KEY && process.env.SKILLPROOF_MOCK_LLM !== "1";
    },
    async runJson(prompt: ProviderPrompt, schemaHint: string): Promise<ProviderResult> {
      const sys = `${prompt.system}\n\nRespond with valid JSON only, matching: ${schemaHint}`;
      const reasoning = mapReasoningBudget("anthropic_api", prompt.reasoningBudget ?? "none");
      const res = await llmCall({
        role: "worker",
        system: sys,
        user: prompt.user,
        maxTokens: prompt.maxTokens,
        temperature: prompt.temperature,
        model: prompt.model ?? opts.defaultModel ?? undefined,
        thinkingBudgetTokens:
          reasoning.kind === "anthropic_thinking" && reasoning.budgetTokens !== null
            ? reasoning.budgetTokens
            : null,
      });
      return {
        json: extractJson(res.text),
        raw: res.text,
        provider: "anthropic_api",
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        model: res.model,
      };
    },
  };
}

export const anthropicApiProvider: LLMProvider = makeAnthropicApiProvider();
