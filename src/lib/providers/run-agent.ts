// runAgentJson — single entry point every agent uses to invoke an LLM.
// Routes through provider matrix on MissionState. Falls back to a deterministic
// heuristic so the pipeline never breaks when providers are missing/broken.

import { selectProviderMatrix, runWithMatrix } from "./provider-router";
import type { AgentRole, ProviderId, ProviderMatrix } from "./types";
import type { MissionState, ScoreSource } from "@/agents/types";

export type RunAgentOpts<T> = {
  state: MissionState;
  role: AgentRole;
  system: string;
  user: string;
  schemaHint: string;
  maxTokens?: number;
  temperature?: number;
  fallback: () => T;
};

export type RunAgentResult<T> = {
  output: T;
  provider: ProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  source: ScoreSource;
};

function sourceFromProvider(p: ProviderId): ScoreSource {
  if (p === "mock") return "mock";
  return "llm";
}

async function ensureMatrix(state: MissionState): Promise<ProviderMatrix> {
  if (state.provider_matrix) return state.provider_matrix;
  const m = await selectProviderMatrix(state.execution_mode ?? "api");
  state.provider_matrix = m;
  return m;
}

export async function runAgentJson<T>(opts: RunAgentOpts<T>): Promise<RunAgentResult<T>> {
  const { state, role, system, user, schemaHint, maxTokens, temperature, fallback } = opts;

  // Pure mock mode: skip provider invocation entirely.
  if (state.mock_mode || state.execution_mode === "mock") {
    return {
      output: fallback(),
      provider: "mock",
      model: "mock:heuristic",
      inputTokens: 0,
      outputTokens: 0,
      source: "mock",
    };
  }

  const matrix = await ensureMatrix(state);
  try {
    const res = await runWithMatrix(matrix, role, { system, user, maxTokens, temperature }, schemaHint);
    if (res.json && typeof res.json === "object" && !("mock" in res.json)) {
      return {
        output: res.json as T,
        provider: res.provider,
        model: res.model,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        source: sourceFromProvider(res.provider),
      };
    }
    // Provider returned no/invalid JSON → heuristic fallback.
    return {
      output: fallback(),
      provider: res.provider,
      model: res.model,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      source: "heuristic",
    };
  } catch {
    return {
      output: fallback(),
      provider: "mock",
      model: "mock:heuristic",
      inputTokens: 0,
      outputTokens: 0,
      source: "heuristic",
    };
  }
}
