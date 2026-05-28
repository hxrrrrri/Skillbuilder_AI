// Anthropic API provider — wraps existing llmCall.

import { llmCall } from "@/lib/claude";
import type { LLMProvider, ProviderHealth, ProviderPrompt, ProviderResult } from "./types";
import { mapReasoningBudget } from "./reasoning";
import { parseProviderJson } from "./json";

export function makeAnthropicApiProvider(opts: { enabled?: boolean; defaultModel?: string | null } = {}): LLMProvider {
  return {
    id: "anthropic_api",
    label: "Anthropic API",
    async available() {
      return opts.enabled !== false && !!process.env.ANTHROPIC_API_KEY;
    },
    async health(): Promise<ProviderHealth> {
      const enabled = opts.enabled !== false;
      const hasKey = !!process.env.ANTHROPIC_API_KEY;
      return {
        providerId: "anthropic_api",
        label: "Anthropic API",
        status: !enabled ? "disabled" : hasKey ? "ready" : "installed_not_authenticated",
        enabled,
        installed: true,
        authenticated: hasKey,
        version: "sdk",
        supportsJson: true,
        supportsNonInteractive: true,
        supportsModelSelection: true,
        supportsReasoningBudget: true,
        availableModels: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
        configuredModel: opts.defaultModel ?? null,
        lastError: hasKey ? null : "ANTHROPIC_API_KEY is missing",
        fix: hasKey ? "API key configured." : "Set ANTHROPIC_API_KEY and rerun Admin -> Providers -> Test.",
        command: "Anthropic SDK messages.create",
      };
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
        json: parseProviderJson(res.text),
        raw: res.text,
        stdout: res.text,
        stderr: "",
        exitCode: 0,
        command: "Anthropic SDK messages.create",
        provider: "anthropic_api",
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        model: res.model,
      };
    },
  };
}

export const anthropicApiProvider: LLMProvider = makeAnthropicApiProvider();
