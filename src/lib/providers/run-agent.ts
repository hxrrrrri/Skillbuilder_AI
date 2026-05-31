// runAgentJson — single entry point every agent uses to invoke an LLM.
// Routes through provider matrix on MissionState. Provider failures fail closed.

import { AgentSkippedError, selectProviderMatrix, runWithMatrix } from "./provider-router";
import { getActivePrompt } from "./registry";
import type { AgentRole, ProviderId, ProviderMatrix, ProviderMatrixAgentEntry } from "./types";
import { ProviderExecutionError } from "./errors";
import type { MissionState, ScoreSource } from "@/agents/types";
import { selectContextForAgent } from "@/lib/agent-context/select-context";
import { buildRuntimeAccounting, estimateTokensFromText } from "@/lib/token-budget";
import { composeAgentSystem } from "@/agents/prompt-policy";

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
  /** Replace raw repo dumps with the dimension-specific selected context. */
  useSelectedContext?: boolean;
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
  const resolved = !active
    ? fallbackSystem
    : active.instructions?.trim()
      ? `${active.system}\n\n${active.instructions}`
      : active.system;
  // Always enforce the shared evidence policy at runtime, even if an admin
  // activated a weak prompt that omits it. Idempotent via the policy marker,
  // so seed-composed prompts are not duplicated.
  return composeAgentSystem(resolved);
}

function fitUserToInputBudget(
  system: string,
  user: string,
  context: string,
  maxInputTokens: number,
): { user: string; truncated: boolean } {
  const maxChars = Math.max(0, maxInputTokens * 4 - system.length - 2);
  if (!context) return { user: user.slice(0, maxChars), truncated: user.length > maxChars };
  const suffix = user.slice(0, maxChars);
  const contextChars = Math.max(0, maxChars - suffix.length - 2);
  const focused = context.slice(0, contextChars);
  return {
    user: [focused, suffix].filter(Boolean).join("\n\n"),
    truncated: user.length > maxChars || context.length > contextChars,
  };
}

export async function runAgentJson<T>(opts: RunAgentOpts<T>): Promise<RunAgentResult<T>> {
  const { state, agentName, role, system, user, schemaHint, maxTokens, temperature } = opts;
  const name = agentName ?? role;
  const effectiveSystem = await resolveSystemPrompt(name, system);

  const matrix = await ensureMatrix(state);
  const selected = selectContextForAgent(state, name);
  const entryMaxTokens = matrix.agents?.[name]?.maxTokens ?? Number.POSITIVE_INFINITY;
  const effectiveMaxTokens = Math.min(
    maxTokens ?? selected.budget.maxOutputTokens,
    selected.budget.maxOutputTokens,
    entryMaxTokens,
  );
  const fittedPrompt = fitUserToInputBudget(
    effectiveSystem,
    user,
    opts.useSelectedContext ? selected.text : "",
    selected.budget.maxInputTokens,
  );
  const effectiveUser = fittedPrompt.user;
  const estimatedInputTokens = estimateTokensFromText(`${effectiveSystem}\n\n${effectiveUser}`);
  try {
    const res = await runWithMatrix(
      matrix,
      role,
      { system: effectiveSystem, user: effectiveUser, maxTokens: effectiveMaxTokens, temperature, agentName: name },
      schemaHint,
      name,
    );
    if (res.runtime) {
      const runtime = {
        ...res.runtime,
        ...buildRuntimeAccounting({
          agentName: name,
          budget: selected.budget,
          estimatedInputTokens,
          actualOutputTokens: res.outputTokens,
        }),
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        contextTruncated: selected.truncated || (!!opts.useSelectedContext && fittedPrompt.truncated),
        promptTruncated: fittedPrompt.truncated,
      };
      state.provider_runtime = { ...(state.provider_runtime ?? {}), [name]: runtime };
      if (matrix.agents) matrix.agents[name] = runtime;
      res.runtime = runtime;
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
      const runtime = {
        ...err.runtime,
        ...buildRuntimeAccounting({
          agentName: name,
          budget: selected.budget,
          estimatedInputTokens,
          actualOutputTokens: 0,
        }),
        inputTokens: 0,
        outputTokens: 0,
        contextTruncated: selected.truncated || (!!opts.useSelectedContext && fittedPrompt.truncated),
        promptTruncated: fittedPrompt.truncated,
      };
      state.provider_runtime = { ...(state.provider_runtime ?? {}), [name]: runtime };
      if (matrix.agents) matrix.agents[name] = runtime;
      err.runtime = runtime;
    }
    throw err;
  }
}
