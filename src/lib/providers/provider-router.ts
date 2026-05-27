// Provider router — picks first available provider per role based on mode.

import { anthropicApiProvider } from "./anthropic";
import { makeCliProvider } from "./cli-provider";
import { loadProviderConfig } from "./config";
import { mockProvider } from "./mock";
import { ollamaProvider } from "./ollama";
import type { AgentRole, LLMProvider, ProviderId, ProviderMatrix, ProviderPrompt, ProviderResult } from "./types";
import type { ExecutionMode } from "@/lib/local-runner/types";

export function buildProviderRegistry(): Record<ProviderId, LLMProvider> {
  const cfg = loadProviderConfig();
  return {
    anthropic_api: anthropicApiProvider,
    claude_cli: makeCliProvider({
      id: "claude_cli",
      label: "Claude CLI",
      template: cfg.providers.claude_cli,
    }),
    codex_cli: makeCliProvider({
      id: "codex_cli",
      label: "Codex CLI",
      template: cfg.providers.codex_cli,
    }),
    copilot_cli: makeCliProvider({
      id: "copilot_cli",
      label: "Copilot CLI",
      template: cfg.providers.copilot_cli,
      probeArgs: ["copilot", "--version"],
    }),
    ollama: ollamaProvider,
    mock: mockProvider,
  };
}

function preferenceFor(role: AgentRole, mode: ExecutionMode): ProviderId[] {
  const cfg = loadProviderConfig();
  const rolePref = (cfg.roles?.[role] ?? []) as ProviderId[];
  if (mode === "api") {
    return ["anthropic_api", "mock"];
  }
  if (mode === "cli") {
    return rolePref.filter((p) => p !== "anthropic_api").concat("mock");
  }
  if (mode === "hybrid") {
    return rolePref.concat("mock");
  }
  return ["mock"];
}

export async function selectProviderMatrix(mode: ExecutionMode): Promise<ProviderMatrix> {
  const reg = buildProviderRegistry();
  const roles: AgentRole[] = ["orchestrator", "worker", "validator", "interview", "profile"];
  const matrix: Partial<ProviderMatrix> = {};
  const usedForWorker: ProviderId[] = [];
  for (const role of roles) {
    const pref = preferenceFor(role, mode);
    let chosen: ProviderId = "mock";
    for (const pid of pref) {
      const p = reg[pid];
      if (!p) continue;
      // Validator should prefer a provider different from worker when possible.
      if (role === "validator" && usedForWorker.includes(pid) && pref.some((x) => x !== pid && x !== "mock")) continue;
      if (await p.available()) {
        chosen = pid;
        break;
      }
    }
    matrix[role] = chosen;
    if (role === "worker") usedForWorker.push(chosen);
  }
  return matrix as ProviderMatrix;
}

export async function runWithMatrix(
  matrix: ProviderMatrix,
  role: AgentRole,
  prompt: ProviderPrompt,
  schemaHint: string,
): Promise<ProviderResult> {
  const reg = buildProviderRegistry();
  const primary = reg[matrix[role]];
  try {
    const out = await primary.runJson(prompt, schemaHint);
    if (out.json !== null || out.provider === "mock") return out;
    // JSON parse failed → fall back to mock to avoid breaking pipeline.
    return await reg.mock.runJson(prompt, schemaHint);
  } catch {
    return await reg.mock.runJson(prompt, schemaHint);
  }
}

export async function listProviderAvailability(): Promise<Array<{ id: ProviderId; label: string; available: boolean }>> {
  const reg = buildProviderRegistry();
  const ids = Object.keys(reg) as ProviderId[];
  return Promise.all(
    ids.map(async (id) => ({
      id,
      label: reg[id].label,
      available: await reg[id].available(),
    })),
  );
}
