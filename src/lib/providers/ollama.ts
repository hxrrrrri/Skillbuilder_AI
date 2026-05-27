// Ollama provider — calls local /api/generate with format:"json".

import { extractJson } from "@/lib/claude";
import { loadProviderConfig } from "./config";
import type { LLMProvider, ProviderPrompt, ProviderResult } from "./types";

export const ollamaProvider: LLMProvider = {
  id: "ollama",
  label: "Ollama",
  async available() {
    const cfg = loadProviderConfig().providers.ollama;
    if (!cfg || cfg.enabled === false) return false;
    const baseUrl = cfg.baseUrl ?? "http://localhost:11434";
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 1500);
      const r = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(t);
      if (!r.ok) return false;
      const data: any = await r.json();
      return Array.isArray(data?.models) && data.models.length > 0;
    } catch {
      return false;
    }
  },
  async runJson(prompt: ProviderPrompt, schemaHint: string): Promise<ProviderResult> {
    const cfg = loadProviderConfig().providers.ollama;
    const baseUrl = cfg?.baseUrl ?? "http://localhost:11434";
    const model = cfg?.model ?? "llama3.1:8b";
    const system = `${prompt.system}\nReturn JSON only matching: ${schemaHint}`;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 120_000);
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: prompt.user,
          system,
          format: "json",
          stream: false,
          options: { temperature: prompt.temperature ?? 0.2 },
        }),
      });
      clearTimeout(t);
      const data: any = await res.json();
      const raw = String(data?.response ?? "");
      return {
        json: extractJson(raw),
        raw,
        provider: "ollama",
        inputTokens: data?.prompt_eval_count ?? Math.ceil((system + prompt.user).length / 4),
        outputTokens: data?.eval_count ?? Math.ceil(raw.length / 4),
        model: `ollama:${model}`,
      };
    } catch (err: any) {
      return {
        json: null,
        raw: `ollama error: ${err?.message ?? err}`,
        provider: "ollama",
        inputTokens: 0,
        outputTokens: 0,
        model: `ollama:${model}`,
      };
    }
  },
};
