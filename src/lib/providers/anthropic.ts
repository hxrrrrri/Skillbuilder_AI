// Anthropic API provider — wraps existing llmCall.

import { extractJson, llmCall } from "@/lib/claude";
import type { LLMProvider, ProviderPrompt, ProviderResult } from "./types";

export const anthropicApiProvider: LLMProvider = {
  id: "anthropic_api",
  label: "Anthropic API",
  async available() {
    return !!process.env.ANTHROPIC_API_KEY && process.env.SKILLPROOF_MOCK_LLM !== "1";
  },
  async runJson(prompt: ProviderPrompt, schemaHint: string): Promise<ProviderResult> {
    const sys = `${prompt.system}\n\nRespond with valid JSON only, matching: ${schemaHint}`;
    const res = await llmCall({
      role: "worker",
      system: sys,
      user: prompt.user,
      maxTokens: prompt.maxTokens,
      temperature: prompt.temperature,
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
