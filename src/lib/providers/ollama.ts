// Ollama provider — calls local /api/generate with format:"json" and fails closed.

import { loadProviderConfig } from "./config";
import type { ProviderTemplate } from "./config";
import { ProviderExecutionError } from "./errors";
import { jsonRepairPrompt, parseProviderJson } from "./json";
import type { LLMProvider, ProviderHealth, ProviderPrompt, ProviderResult } from "./types";

async function listModels(baseUrl: string): Promise<any[]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 2000);
  try {
    const r = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data: any = await r.json();
    return Array.isArray(data?.models) ? data.models : [];
  } finally {
    clearTimeout(t);
  }
}

export async function detectOllama(template?: ProviderTemplate): Promise<ProviderHealth> {
  const cfg = template ?? loadProviderConfig().providers.ollama;
  const baseUrl = cfg?.baseUrl ?? "http://localhost:11434";
  const model = cfg?.model ?? "llama3.1:8b";
  if (cfg?.enabled === false) {
    return {
      providerId: "ollama",
      label: "Ollama",
      status: "disabled",
      enabled: false,
      installed: false,
      authenticated: true,
      version: null,
      supportsJson: true,
      supportsNonInteractive: true,
      supportsModelSelection: true,
      supportsReasoningBudget: false,
      availableModels: [],
      configuredModel: model,
      fix: "Enable Ollama in Admin -> Providers after starting the local Ollama server.",
      command: baseUrl,
    };
  }
  try {
    const models = await listModels(baseUrl);
    const names = models.map((m) => String(m?.name ?? m?.model ?? "")).filter(Boolean);
    const installed = names.some((n) => n === model || n.startsWith(`${model}:`) || model.startsWith(`${n}:`));
    return {
      providerId: "ollama",
      label: "Ollama",
      status: installed ? "ready" : "invalid_command",
      enabled: true,
      installed: true,
      authenticated: true,
      version: "local-server",
      supportsJson: true,
      supportsNonInteractive: true,
      supportsModelSelection: true,
      supportsReasoningBudget: false,
      availableModels: names,
      configuredModel: model,
      lastError: installed ? null : `configured model '${model}' is not installed`,
      fix: installed
        ? "Local-only provider. Prompts stay on the configured Ollama host."
        : `Run an explicit admin-approved pull: ollama pull ${model}`,
      command: baseUrl,
      rawOutputPreview: JSON.stringify({ models: names.slice(0, 20) }).slice(0, 2000),
    };
  } catch (err: any) {
    return {
      providerId: "ollama",
      label: "Ollama",
      status: "missing_binary",
      enabled: true,
      installed: false,
      authenticated: true,
      version: null,
      supportsJson: true,
      supportsNonInteractive: true,
      supportsModelSelection: true,
      supportsReasoningBudget: false,
      availableModels: [],
      configuredModel: model,
      lastError: err?.message ?? String(err),
      fix: "Install/start Ollama, then run `ollama pull qwen2.5-coder` or another configured model. Pulling is never automatic.",
      command: baseUrl,
    };
  }
}

export function makeOllamaProvider(template?: ProviderTemplate): LLMProvider {
  return {
    id: "ollama",
    label: "Ollama",
    async available() {
      const health = await detectOllama(template);
      return health.status === "ready";
    },
    health() {
      return detectOllama(template);
    },
    async runJson(prompt: ProviderPrompt, schemaHint: string): Promise<ProviderResult> {
      const cfg = template ?? loadProviderConfig().providers.ollama;
      const baseUrl = cfg?.baseUrl ?? "http://localhost:11434";
      const model = prompt.model ?? cfg?.model ?? "llama3.1:8b";
      const system = `${prompt.system}\nReturn JSON only matching: ${schemaHint}`;
      const first = await generate(baseUrl, model, system, prompt.user, prompt.temperature);
      const firstJson = parseProviderJson(first.raw);
      if (firstJson !== null) return { ...first, json: firstJson };
      const repair = jsonRepairPrompt(prompt.user, schemaHint, first.raw);
      const retry = await generate(baseUrl, model, system, repair, 0);
      return { ...retry, json: parseProviderJson(retry.raw) };
    },
  };
}

async function generate(
  baseUrl: string,
  model: string,
  system: string,
  user: string,
  temperature?: number,
): Promise<ProviderResult> {
  const started = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: user,
        system,
        format: "json",
        stream: false,
        options: { temperature: temperature ?? 0.2 },
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    const raw = String(data?.response ?? data?.error ?? "");
    if (!res.ok) {
      throw new ProviderExecutionError({
        provider: "ollama",
        message: `Ollama failed with HTTP ${res.status}`,
        code: /not found|pull/i.test(raw) ? "provider_unavailable" : "provider_execution_failed",
        stdout: raw,
        fix: /not found|pull/i.test(raw)
          ? `Configured model '${model}' is missing. Pull it explicitly with: ollama pull ${model}`
          : "Confirm the Ollama server is running and the configured base URL is correct.",
      });
    }
    return {
      json: null,
      raw,
      stdout: raw,
      stderr: "",
      exitCode: 0,
      command: `${baseUrl}/api/generate`,
      latencyMs: Date.now() - started,
      provider: "ollama",
      inputTokens: data?.prompt_eval_count ?? Math.ceil((system + user).length / 4),
      outputTokens: data?.eval_count ?? Math.ceil(raw.length / 4),
      model: `ollama:${model}`,
    };
  } catch (err: any) {
    if (err instanceof ProviderExecutionError) throw err;
    throw new ProviderExecutionError({
      provider: "ollama",
      message: `Ollama unavailable: ${err?.message ?? err}`,
      code: "provider_unavailable",
      fix: "Start Ollama at the configured base URL and ensure the selected model is installed.",
    });
  } finally {
    clearTimeout(t);
  }
}

export const ollamaProvider: LLMProvider = makeOllamaProvider();
