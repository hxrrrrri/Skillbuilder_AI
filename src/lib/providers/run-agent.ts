// runAgentJson — single entry point every agent uses to invoke an LLM.
// Routes through provider matrix on MissionState. Provider failures fail closed.

import { AgentSkippedError, selectProviderMatrix, runWithMatrix } from "./provider-router";
import { getActivePrompt } from "./registry";
import type { AgentRole, ProviderId, ProviderMatrix, ProviderMatrixAgentEntry } from "./types";
import { ProviderExecutionError } from "./errors";
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
  onInvalidJson?: "retry" | "fail";
  onUnavailable?: "fail" | "skip_if_optional";
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
  if (p === "deterministic") return "deterministic";
  return "llm";
}

async function ensureMatrix(state: MissionState): Promise<ProviderMatrix> {
  if (state.provider_matrix) return state.provider_matrix;
  const m = await selectProviderMatrix(state.execution_mode ?? "api");
  state.provider_matrix = m;
  return m;
}

async function resolveSystemPrompt(agentName: string, fallbackSystem: string): Promise<string> {
  const active = await getActivePrompt(agentName);
  if (!active) return fallbackSystem;
  return active.instructions?.trim()
    ? `${active.system}\n\n${active.instructions}`
    : active.system;
}

export async function runAgentJson<T>(opts: RunAgentOpts<T>): Promise<RunAgentResult<T>> {
  const { state, agentName, role, system, user, schemaHint, maxTokens, temperature } = opts;
  const name = agentName ?? role;
  const effectiveSystem = await resolveSystemPrompt(name, system);

  const matrix = await ensureMatrix(state);
  try {
    const res = await runWithMatrix(
      matrix,
      role,
      { system: effectiveSystem, user, maxTokens, temperature, agentName: name },
      schemaHint,
      name,
    );
    if (res.runtime) {
      state.provider_runtime = { ...(state.provider_runtime ?? {}), [name]: res.runtime };
      if (matrix.agents) matrix.agents[name] = res.runtime;
    }
    return {
      output: res.json as T,
      provider: res.provider,
      model: res.model,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      source: sourceFromProvider(res.provider),
      runtime: res.runtime,
    };
  } catch (err) {
    if (err instanceof AgentSkippedError) throw err;
    if (err instanceof ProviderExecutionError && err.runtime) {
      state.provider_runtime = { ...(state.provider_runtime ?? {}), [name]: err.runtime };
      if (matrix.agents) matrix.agents[name] = err.runtime;
    }
    throw err;
  }
}
