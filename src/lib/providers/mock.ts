// Mock provider — deterministic fallback when nothing else available.

import type { LLMProvider, ProviderPrompt, ProviderResult } from "./types";

export const mockProvider: LLMProvider = {
  id: "mock",
  label: "Mock / Heuristic",
  async available() {
    return true;
  },
  async runJson(prompt: ProviderPrompt, _schemaHint: string): Promise<ProviderResult> {
    const raw = JSON.stringify({ mock: true, note: "no provider available", echo: prompt.user.slice(0, 200) });
    return {
      json: { mock: true },
      raw,
      provider: "mock",
      inputTokens: 0,
      outputTokens: 0,
      model: "mock:heuristic",
    };
  },
};
