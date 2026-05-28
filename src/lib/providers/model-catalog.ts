import type { ProviderId } from "./types";

export const PROVIDER_MODEL_CATALOG: Record<ProviderId, string[]> = {
  anthropic_api: [
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
  ],
  claude_cli: [
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "opus",
    "sonnet",
  ],
  codex_cli: ["gpt-5.5"],
  copilot_cli: [
    "claude-haiku-4.5",
  ],
  ollama: [
    "llama3.2:latest",
    "llama3:latest",
    "gemma4:31b-cloud",
    "gemma3:4b",
    "gemma4:e2b",
  ],
  deterministic: ["repo-scanner", "git-evidence", "skill-graph"],
};

export function modelsForProvider(providerId: string, configured: string[] = []): string[] {
  const catalog = PROVIDER_MODEL_CATALOG[providerId as ProviderId] ?? [];
  return Array.from(new Set([...configured, ...catalog].filter(Boolean)));
}

export function defaultModelForProvider(providerId: string, configured?: string | null): string {
  if (configured) return configured;
  return modelsForProvider(providerId)[0] ?? providerId;
}
