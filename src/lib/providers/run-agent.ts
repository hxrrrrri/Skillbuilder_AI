// runAgentJson — single entry point every agent uses to invoke an LLM.
// Routes through provider matrix on MissionState. Falls back to a deterministic
// heuristic so the pipeline never breaks when providers are missing/broken.

import { AgentSkippedError, selectProviderMatrix, runWithMatrix } from "./provider-router";
import type { AgentRole, ProviderId, ProviderMatrix, ProviderMatrixAgentEntry } from "./types";
import type { MissionState, ScoreSource } from "@/agents/types";

export type RunAgentOpts<T> = {
  state: MissionState;
  agentName?: string;
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
  runtime?: ProviderMatrixAgentEntry;
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
  const { state, agentName, role, system, user, schemaHint, maxTokens, temperature, fallback } = opts;
  const name = agentName ?? role;

  // Pure mock mode: skip provider invocation entirely.
  if (state.mock_mode || state.execution_mode === "mock") {
    const matrix = await ensureMatrix(state);
    const base = matrix.agents?.[name];
    const runtime: ProviderMatrixAgentEntry | undefined = base
      ? {
          ...base,
          status: "used",
          actualProvider: "mock",
          actualModel: "mock:heuristic",
          requestedProvider: base.provider,
          requestedModel: base.model,
          note: "mock mode",
        }
      : undefined;
    if (runtime) {
      state.provider_runtime = { ...(state.provider_runtime ?? {}), [name]: runtime };
      if (matrix.agents) matrix.agents[name] = runtime;
    }
    return {
      output: fallback(),
      provider: "mock",
      model: "mock:heuristic",
      inputTokens: 0,
      outputTokens: 0,
      source: "mock",
      runtime,
    };
  }

  const matrix = await ensureMatrix(state);
  try {
    const res = await runWithMatrix(
      matrix,
      role,
      { system, user, maxTokens, temperature, agentName: name },
      schemaHint,
      name,
    );
    if (res.runtime) {
      state.provider_runtime = { ...(state.provider_runtime ?? {}), [name]: res.runtime };
      if (matrix.agents) matrix.agents[name] = res.runtime;
    }
    if (res.json && typeof res.json === "object" && !("mock" in res.json)) {
      return {
        output: res.json as T,
        provider: res.provider,
        model: res.model,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        source: sourceFromProvider(res.provider),
        runtime: res.runtime,
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
      runtime: res.runtime,
    };
  } catch (err) {
    if (err instanceof AgentSkippedError) throw err;
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
