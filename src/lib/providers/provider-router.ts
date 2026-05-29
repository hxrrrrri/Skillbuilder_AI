// Provider router — resolves runtime provider/model settings and executes agents.

import { makeAnthropicApiProvider } from "./anthropic";
import { makeClaudeCliProvider } from "./claude-cli";
import { makeCodexCliProvider } from "./codex-cli";
import { makeCopilotCliProvider } from "./copilot-cli";
import { loadProviderConfig, type ProviderTemplate } from "./config";
import { deterministicProvider } from "./deterministic";
import { ProviderExecutionError, ProviderInvalidJsonError } from "./errors";
import { makeOllamaProvider } from "./ollama";
import { mapReasoningBudget, type ReasoningBudget } from "./reasoning";
import { defaultModelForProvider } from "./model-catalog";
import { isDeterministicOnlyAgent } from "./defaults";
import {
  AGENT_NAMES,
  listProviderConfigs,
  resolveAgentConfig,
  type ResolvedAgentConfig,
} from "./registry";
import { providerCache } from "./cache";
import type {
  AgentRole,
  LLMProvider,
  ProviderId,
  ProviderHealth,
  ProviderMatrix,
  ProviderMatrixAgentEntry,
  ProviderPrompt,
  ProviderResult,
} from "./types";
import type { ExecutionMode } from "@/lib/local-runner/types";

const ROLES: AgentRole[] = ["orchestrator", "worker", "validator", "interview", "profile"];

const AGENT_ROLE: Record<string, AgentRole> = {
  orchestrator: "orchestrator",
  validator: "validator",
  "answer-evaluator": "validator",
  "interview-gen": "interview",
  "profile-gen": "profile",
  "employer-verifier": "profile",
  "improvement-plan": "profile",
};

type ProviderRow = {
  providerId: string;
  enabled: boolean;
  defaultModel: string | null;
  baseUrl: string | null;
  command: string | null;
  argsTemplate: string | null;
};

export class AgentSkippedError extends Error {
  agentName: string;
  runtime?: ProviderMatrixAgentEntry;

  constructor(agentName: string, message: string, runtime?: ProviderMatrixAgentEntry) {
    super(message);
    this.name = "AgentSkippedError";
    this.agentName = agentName;
    this.runtime = runtime;
  }
}

function isProviderId(value: unknown): value is ProviderId {
  return (
    value === "anthropic_api" ||
    value === "claude_cli" ||
    value === "codex_cli" ||
    value === "ollama" ||
    value === "copilot_cli" ||
    value === "deterministic"
  );
}

function parseArgsTemplate(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function providerRows(): Promise<Map<string, ProviderRow>> {
  try {
    const rows = await listProviderConfigs();
    return new Map(rows.map((r) => [r.providerId, r]));
  } catch (err) {
    console.error("[provider-router] failed to load DB provider config", err);
    return new Map();
  }
}

function templateFromDb(row: ProviderRow | undefined, fallback: ProviderTemplate | undefined): ProviderTemplate | undefined {
  if (!row) return fallback;
  return {
    command: row.command ?? fallback?.command,
    args: parseArgsTemplate(row.argsTemplate) ?? fallback?.args,
    model: row.defaultModel ?? fallback?.model,
    baseUrl: row.baseUrl ?? fallback?.baseUrl,
    enabled: row.enabled,
  };
}

export async function buildProviderRegistry(): Promise<Record<ProviderId, LLMProvider>> {
  const cfg = loadProviderConfig();
  const rows = await providerRows();
  return {
    anthropic_api: makeAnthropicApiProvider({
      enabled: rows.get("anthropic_api")?.enabled,
      defaultModel: rows.get("anthropic_api")?.defaultModel ?? null,
    }),
    claude_cli: makeClaudeCliProvider(templateFromDb(rows.get("claude_cli"), cfg.providers.claude_cli)),
    codex_cli: makeCodexCliProvider(templateFromDb(rows.get("codex_cli"), cfg.providers.codex_cli)),
    copilot_cli: makeCopilotCliProvider(templateFromDb(rows.get("copilot_cli"), cfg.providers.copilot_cli)),
    ollama: makeOllamaProvider(templateFromDb(rows.get("ollama"), cfg.providers.ollama)),
    deterministic: deterministicProvider,
  };
}

function preferenceFor(role: AgentRole, mode: ExecutionMode): ProviderId[] {
  const cfg = loadProviderConfig();
  const rolePref = ((cfg.roles?.[role] ?? []) as string[]).filter(isProviderId).filter((p) => p !== "deterministic");
  if (mode === "api") {
    return ["anthropic_api"];
  }
  if (mode === "cli") {
    const cli = rolePref.filter((p) => p !== "anthropic_api" && p !== "ollama");
    return cli.length ? cli : ["claude_cli", "codex_cli", "copilot_cli"];
  }
  if (mode === "hybrid") {
    return rolePref.length ? rolePref : ["anthropic_api", "claude_cli", "codex_cli", "ollama"];
  }
  return rolePref.filter((p) => p !== "anthropic_api").length
    ? rolePref.filter((p) => p !== "anthropic_api")
    : ["ollama", "claude_cli", "codex_cli", "copilot_cli"];
}

function modelForProvider(provider: ProviderId, resolved: ResolvedAgentConfig): string {
  if (provider === "deterministic") return resolved.model || "evidence-derived";
  if (provider === resolved.provider) return resolved.model;
  const cfg = loadProviderConfig();
  if (provider === "ollama") return cfg.providers.ollama?.model ?? resolved.model;
  const configured = cfg.providers[provider as keyof typeof cfg.providers]?.model;
  return defaultModelForProvider(provider, configured);
}

async function chooseAvailableProvider(
  role: AgentRole,
  mode: ExecutionMode,
  reg: Record<ProviderId, LLMProvider>,
): Promise<{ provider: ProviderId; source: "file" }> {
  for (const pid of preferenceFor(role, mode)) {
    const provider = reg[pid];
    if (!provider) continue;
    if (await provider.available()) {
      return { provider: pid, source: "file" };
    }
  }
  throw new ProviderExecutionError({
    provider: "anthropic_api",
    code: "provider_unavailable",
    message: `No ready provider available for ${role} in ${mode} mode.`,
    fix: "Open Admin -> Providers -> Health, configure at least one real provider, and run a passing JSON contract test.",
  });
}

function toMatrixEntry(resolved: ResolvedAgentConfig, source: "db" | "default" | "file" | "deterministic"): ProviderMatrixAgentEntry {
  return {
    provider: resolved.provider,
    model: resolved.model,
    reasoningBudget: resolved.reasoningBudget,
    enabled: resolved.enabled,
    fallbackProvider: resolved.fallbackProvider,
    fallbackModel: resolved.fallbackModel,
    fallbackStrategy: resolved.fallbackStrategy,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    jsonMode: resolved.jsonMode,
    timeoutMs: resolved.timeoutMs,
    retryCount: resolved.retryCount,
    source,
    status: "planned",
  };
}

async function resolveMatrixEntry(
  agentName: string,
  role: AgentRole,
  mode: ExecutionMode,
  reg: Record<ProviderId, LLMProvider>,
): Promise<ProviderMatrixAgentEntry> {
  const resolved = await resolveAgentConfig(agentName);
  if (resolved.provider === "deterministic" && !isDeterministicOnlyAgent(agentName)) {
    throw new ProviderExecutionError({
      provider: "deterministic",
      code: "provider_unsupported",
      message: `Agent '${agentName}' requires a real LLM provider; deterministic evidence cannot score LLM-reviewed skills.`,
      fix: "Choose Anthropic API, Claude CLI, Codex CLI, Copilot CLI, or Ollama for this agent in Admin -> Agents.",
    });
  }
  const modeRequiresNonApi = mode === "cli" || mode === "local";
  const apiUnavailableInHybrid =
    mode === "hybrid" && resolved.provider === "anthropic_api" && !(await reg.anthropic_api.available());
  if ((modeRequiresNonApi && resolved.provider === "anthropic_api") || apiUnavailableInHybrid) {
    const chosen = await chooseAvailableProvider(role, mode, reg);
    return {
      ...toMatrixEntry(resolved, chosen.source),
      provider: chosen.provider,
      model: modelForProvider(chosen.provider, resolved),
      reasoningBudget: chosen.provider === "anthropic_api" ? resolved.reasoningBudget : "none",
      note: `execution mode ${mode} selected ${chosen.provider} instead of anthropic_api`,
    };
  }
  if (resolved.source === "db") return toMatrixEntry(resolved, "db");
  if (resolved.provider === "deterministic") return toMatrixEntry(resolved, "deterministic");

  const chosen = await chooseAvailableProvider(role, mode, reg);
  return {
    ...toMatrixEntry(resolved, chosen.source),
    provider: chosen.provider,
    model: modelForProvider(chosen.provider, resolved),
  };
}

export async function selectProviderMatrix(mode: ExecutionMode): Promise<ProviderMatrix> {
  const reg = await buildProviderRegistry();
  const matrix: Partial<ProviderMatrix> = {};
  const usedForWorker: ProviderId[] = [];
  for (const role of ROLES) {
    const pref = preferenceFor(role, mode);
    let chosen: ProviderId | null = null;
    for (const pid of pref) {
      const p = reg[pid];
      if (!p) continue;
      if (role === "validator" && usedForWorker.includes(pid) && pref.some((x) => x !== pid)) continue;
      if (await p.available()) {
        chosen = pid;
        break;
      }
    }
    if (!chosen) {
      throw new ProviderExecutionError({
        provider: "anthropic_api",
        code: "provider_unavailable",
        message: `No ready provider available for ${role} in ${mode} mode.`,
        fix: "Open Admin -> Providers -> Health and run provider setup tests before starting verification.",
      });
    }
    matrix[role] = chosen;
    if (role === "worker") usedForWorker.push(chosen);
  }

  const agents: Record<string, ProviderMatrixAgentEntry> = {};
  for (const agentName of AGENT_NAMES) {
    const role = AGENT_ROLE[agentName] ?? "worker";
    agents[agentName] = await resolveMatrixEntry(agentName, role, mode, reg);
  }
  matrix.agents = agents;
  return matrix as ProviderMatrix;
}

function legacyEntry(matrix: ProviderMatrix, role: AgentRole, prompt: ProviderPrompt): ProviderMatrixAgentEntry {
  const provider = matrix[role];
  const model = prompt.model ?? provider;
  return {
    provider,
    model,
    reasoningBudget: prompt.reasoningBudget ?? "none",
    enabled: true,
    fallbackProvider: null,
    fallbackModel: null,
    fallbackStrategy: "fail",
    temperature: prompt.temperature ?? 0.2,
    maxTokens: prompt.maxTokens ?? 1500,
    jsonMode: true,
    timeoutMs: 60_000,
    retryCount: 1,
    source: "file",
    status: "planned",
  };
}

function entryFor(matrix: ProviderMatrix, role: AgentRole, agentName: string | undefined, prompt: ProviderPrompt): ProviderMatrixAgentEntry {
  if (agentName && matrix.agents?.[agentName]) return matrix.agents[agentName];
  return legacyEntry(matrix, role, prompt);
}

function runtimeFor(
  entry: ProviderMatrixAgentEntry,
  result: ProviderResult,
  status: ProviderMatrixAgentEntry["status"],
  note?: string,
): ProviderMatrixAgentEntry {
  return {
    ...entry,
    status,
    actualProvider: result.provider,
    actualModel: result.model,
    requestedProvider: entry.provider,
    requestedModel: entry.model,
    reasoning: mapReasoningBudget(result.provider, entry.reasoningBudget as ReasoningBudget),
    note,
  };
}

async function runProvider(
  provider: LLMProvider,
  entry: ProviderMatrixAgentEntry,
  prompt: ProviderPrompt,
  schemaHint: string,
): Promise<ProviderResult> {
  return provider.runJson(
    {
      ...prompt,
      model: entry.model,
      maxTokens: prompt.maxTokens ?? entry.maxTokens,
      temperature: prompt.temperature ?? entry.temperature,
      reasoningBudget: entry.reasoningBudget,
    },
    schemaHint,
  );
}

function hasUsableJson(result: ProviderResult): boolean {
  return result.json !== null;
}

async function handleProviderFailure(
  err: unknown,
  reg: Record<ProviderId, LLMProvider>,
  entry: ProviderMatrixAgentEntry,
  provider: LLMProvider,
  prompt: ProviderPrompt,
  schemaHint: string,
  agentName: string,
): Promise<ProviderResult> {
  const note = err instanceof Error ? err.message : String(err);
  if (entry.fallbackStrategy === "skip_optional") {
    throw new AgentSkippedError(agentName, note || "provider failed", {
      ...entry,
      status: "skipped",
      note: note || "provider failed",
    });
  }
  if (entry.fallbackStrategy === "retry") {
    try {
      const retry = await runProvider(provider, entry, prompt, schemaHint);
      if (hasUsableJson(retry)) return { ...retry, runtime: runtimeFor(entry, retry, "used", "retry after provider failure") };
    } catch {}
    if (entry.fallbackProvider && entry.fallbackProvider !== entry.provider) {
      const fallback = reg[entry.fallbackProvider];
      if (fallback && await fallback.available()) {
        const result = await runProvider(
          fallback,
          { ...entry, provider: entry.fallbackProvider, model: entry.fallbackModel ?? modelForProvider(entry.fallbackProvider, entry as any) },
          prompt,
          schemaHint,
        );
        if (hasUsableJson(result)) return { ...result, runtime: runtimeFor(entry, result, "fallback", note) };
      }
    }
  }
  const providerError = err instanceof ProviderExecutionError
    ? err
    : new ProviderExecutionError({
        provider: entry.provider,
        code: "provider_execution_failed",
        message: note || "provider failed",
        agentName,
        runtime: { ...entry, status: "failed", note },
        fix: "Open Admin -> Providers -> Health, fix the provider, and retry the mission.",
      });
  providerError.runtime = providerError.runtime ?? { ...entry, status: "failed", note };
  throw providerError;
}

export async function runWithMatrix(
  matrix: ProviderMatrix,
  role: AgentRole,
  prompt: ProviderPrompt,
  schemaHint: string,
  agentName?: string,
): Promise<ProviderResult> {
  const reg = await buildProviderRegistry();
  const name = agentName ?? prompt.agentName ?? role;
  const entry = entryFor(matrix, role, name, prompt);
  if (!entry.enabled) {
    throw new AgentSkippedError(name, "disabled in admin", {
      ...entry,
      status: "skipped",
      note: "disabled in admin",
    });
  }

  const primary = reg[entry.provider];
  if (!primary) {
    throw new ProviderExecutionError({
      provider: entry.provider,
      code: "provider_unavailable",
      message: `provider ${entry.provider} is not registered`,
      agentName: name,
      runtime: { ...entry, status: "failed", note: "provider not registered" },
    });
  }
  if (!(await primary.available())) {
    return handleProviderFailure(
      new Error(`provider ${entry.provider} unavailable`),
      reg,
      entry,
      primary,
      prompt,
      schemaHint,
      name,
    );
  }

  let result: ProviderResult;
  try {
    result = await runProvider(primary, entry, prompt, schemaHint);
  } catch (err) {
    return handleProviderFailure(err, reg, entry, primary, prompt, schemaHint, name);
  }

  if (hasUsableJson(result)) {
    return { ...result, runtime: runtimeFor(entry, result, "used") };
  }

  if (entry.fallbackStrategy === "skip_optional") {
    throw new AgentSkippedError(name, "provider returned invalid JSON", {
      ...entry,
      status: "skipped",
      note: "provider returned invalid JSON",
    });
  }
  if (entry.fallbackStrategy === "retry") {
    const retry = await runProvider(primary, entry, prompt, schemaHint);
    if (hasUsableJson(retry)) return { ...retry, runtime: runtimeFor(entry, retry, "used", "retry after invalid JSON") };
  }
  throw new ProviderInvalidJsonError({
    provider: entry.provider,
    agentName: name,
    result,
    runtime: runtimeFor(entry, result, "failed", "provider returned invalid JSON"),
  });
}

export async function listProviderAvailability(): Promise<Array<{ id: ProviderId; label: string; available: boolean }>> {
  const reg = await buildProviderRegistry();
  const ids = Object.keys(reg) as ProviderId[];
  return Promise.all(
    ids.map(async (id) => ({
      id,
      label: reg[id].label,
      available: await reg[id].available(),
    })),
  );
}

export async function listProviderHealth(): Promise<ProviderHealth[]> {
  const reg = await buildProviderRegistry();
  const ids = Object.keys(reg) as ProviderId[];
  return Promise.all(
    ids.map(async (id) => {
      const provider = reg[id];
      if (provider.health) return provider.health();
      const available = await provider.available();
      return {
        providerId: id,
        label: provider.label,
        status: available ? "ready" : "failed",
        enabled: true,
        installed: available,
        authenticated: available,
        version: null,
        supportsJson: true,
        supportsNonInteractive: true,
        supportsModelSelection: false,
        supportsReasoningBudget: false,
        availableModels: [],
        configuredModel: null,
        fix: available ? "Provider is ready." : "Run provider-specific setup.",
        command: null,
      };
    }),
  );
}

export async function checkProviderReadinessForMode(mode: ExecutionMode): Promise<{
  ok: boolean;
  mode: ExecutionMode;
  matrix: ProviderMatrix | null;
  blockers: Array<{
    providerId: ProviderId;
    agentName?: string;
    reason: string;
    fix: string;
    lastTestStatus?: string | null;
    lastTestJsonOk?: boolean | null;
  }>;
}> {
  // Cache per mode: a burst of analyze requests would otherwise re-run the full
  // matrix selection (incl. provider availability probes) + a DB read each time.
  // Busted by invalidateProviderRegistryCache on any provider/agent config write.
  return providerCache.getOrLoad(`readiness:${mode}`, () => computeProviderReadinessForMode(mode));
}

async function computeProviderReadinessForMode(mode: ExecutionMode): Promise<{
  ok: boolean;
  mode: ExecutionMode;
  matrix: ProviderMatrix | null;
  blockers: Array<{
    providerId: ProviderId;
    agentName?: string;
    reason: string;
    fix: string;
    lastTestStatus?: string | null;
    lastTestJsonOk?: boolean | null;
  }>;
}> {
  let matrix: ProviderMatrix;
  try {
    matrix = await selectProviderMatrix(mode);
  } catch (err) {
    return {
      ok: false,
      mode,
      matrix: null,
      blockers: [{
        providerId: "anthropic_api",
        reason: err instanceof Error ? err.message : String(err),
        fix: "Open Admin -> Providers -> Health, configure at least one real provider, and run provider tests.",
      }],
    };
  }
  const rows = await listProviderConfigs();
  const rowByProvider = new Map(rows.map((r) => [r.providerId, r]));
  const blockers: Array<{
    providerId: ProviderId;
    agentName?: string;
    reason: string;
    fix: string;
    lastTestStatus?: string | null;
    lastTestJsonOk?: boolean | null;
  }> = [];
  for (const [agentName, entry] of Object.entries(matrix.agents ?? {})) {
    if (!entry.enabled || entry.provider === "deterministic") continue;
    if (entry.fallbackStrategy === "skip_optional") continue;
    const row = rowByProvider.get(entry.provider);
    if (!row) {
      blockers.push({
        providerId: entry.provider,
        agentName,
        reason: "provider is missing from DB registry",
        fix: "Run `npm run db:seed-registry -- --force`, then test the provider.",
      });
      continue;
    }
    if (!row.enabled) {
      blockers.push({
        providerId: entry.provider,
        agentName,
        reason: "provider is disabled",
        fix: "Enable the provider in Admin -> Providers.",
        lastTestStatus: row.lastTestStatus,
        lastTestJsonOk: row.lastTestJsonOk,
      });
      continue;
    }
    if (row.lastTestStatus !== "ok" || row.lastTestJsonOk !== true) {
      blockers.push({
        providerId: entry.provider,
        agentName,
        reason: "provider has not passed the JSON contract health test",
        fix: "Run Admin -> Providers -> Health -> Run test and fix the reported setup issue.",
        lastTestStatus: row.lastTestStatus,
        lastTestJsonOk: row.lastTestJsonOk,
      });
    }
  }
  return { ok: blockers.length === 0, mode, matrix, blockers };
}
