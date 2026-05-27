// Provider router — resolves runtime provider/model settings and executes agents.

import { makeAnthropicApiProvider } from "./anthropic";
import { makeCliProvider } from "./cli-provider";
import { loadProviderConfig, type ProviderTemplate } from "./config";
import { mockProvider } from "./mock";
import { makeOllamaProvider } from "./ollama";
import { mapReasoningBudget, type ReasoningBudget } from "./reasoning";
import {
  AGENT_NAMES,
  listProviderConfigs,
  resolveAgentConfig,
  type ResolvedAgentConfig,
} from "./registry";
import type {
  AgentRole,
  LLMProvider,
  ProviderId,
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
    value === "mock"
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
    claude_cli: makeCliProvider({
      id: "claude_cli",
      label: "Claude CLI",
      template: templateFromDb(rows.get("claude_cli"), cfg.providers.claude_cli),
    }),
    codex_cli: makeCliProvider({
      id: "codex_cli",
      label: "Codex CLI",
      template: templateFromDb(rows.get("codex_cli"), cfg.providers.codex_cli),
    }),
    copilot_cli: makeCliProvider({
      id: "copilot_cli",
      label: "Copilot CLI",
      template: templateFromDb(rows.get("copilot_cli"), cfg.providers.copilot_cli),
      probeArgs: ["copilot", "--version"],
    }),
    ollama: makeOllamaProvider(templateFromDb(rows.get("ollama"), cfg.providers.ollama)),
    mock: mockProvider,
  };
}

function preferenceFor(role: AgentRole, mode: ExecutionMode): ProviderId[] {
  const cfg = loadProviderConfig();
  const rolePref = ((cfg.roles?.[role] ?? []) as string[]).filter(isProviderId);
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

function modelForProvider(provider: ProviderId, resolved: ResolvedAgentConfig): string {
  if (provider === "mock") return "mock:heuristic";
  if (provider === resolved.provider) return resolved.model;
  const cfg = loadProviderConfig();
  if (provider === "ollama") return cfg.providers.ollama?.model ?? resolved.model;
  return resolved.model;
}

async function chooseAvailableProvider(
  role: AgentRole,
  mode: ExecutionMode,
  reg: Record<ProviderId, LLMProvider>,
): Promise<{ provider: ProviderId; source: "file" | "mock" }> {
  for (const pid of preferenceFor(role, mode)) {
    const provider = reg[pid];
    if (!provider) continue;
    if (await provider.available()) {
      return { provider: pid, source: pid === "mock" ? "mock" : "file" };
    }
  }
  return { provider: "mock", source: "mock" };
}

function toMatrixEntry(resolved: ResolvedAgentConfig, source: "db" | "default" | "file" | "mock"): ProviderMatrixAgentEntry {
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
  if (resolved.source === "db") return toMatrixEntry(resolved, "db");

  const chosen = await chooseAvailableProvider(role, mode, reg);
  return {
    ...toMatrixEntry(resolved, chosen.source),
    provider: chosen.provider,
    model: modelForProvider(chosen.provider, resolved),
    reasoningBudget: chosen.provider === "mock" ? "none" : resolved.reasoningBudget,
  };
}

export async function selectProviderMatrix(mode: ExecutionMode): Promise<ProviderMatrix> {
  const reg = await buildProviderRegistry();
  const matrix: Partial<ProviderMatrix> = {};
  const usedForWorker: ProviderId[] = [];
  for (const role of ROLES) {
    const pref = preferenceFor(role, mode);
    let chosen: ProviderId = "mock";
    for (const pid of pref) {
      const p = reg[pid];
      if (!p) continue;
      if (role === "validator" && usedForWorker.includes(pid) && pref.some((x) => x !== pid && x !== "mock")) continue;
      if (await p.available()) {
        chosen = pid;
        break;
      }
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
  const provider = matrix[role] ?? "mock";
  const model = prompt.model ?? (provider === "mock" ? "mock:heuristic" : provider);
  return {
    provider,
    model,
    reasoningBudget: prompt.reasoningBudget ?? "none",
    enabled: true,
    fallbackProvider: "mock",
    fallbackModel: null,
    fallbackStrategy: "mock",
    temperature: prompt.temperature ?? 0.2,
    maxTokens: prompt.maxTokens ?? 1500,
    jsonMode: true,
    timeoutMs: 60_000,
    retryCount: 1,
    source: provider === "mock" ? "mock" : "file",
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
  return result.json !== null || result.provider === "mock";
}

async function fallbackToMock(
  reg: Record<ProviderId, LLMProvider>,
  entry: ProviderMatrixAgentEntry,
  prompt: ProviderPrompt,
  schemaHint: string,
  note: string,
): Promise<ProviderResult> {
  const result = await runProvider(
    reg.mock,
    { ...entry, provider: "mock", model: "mock:heuristic", reasoningBudget: "none" },
    prompt,
    schemaHint,
  );
  const runtime = runtimeFor(entry, result, "fallback", note);
  return { ...result, runtime };
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
  if (entry.fallbackStrategy === "skip") {
    throw new AgentSkippedError(agentName, note || "provider failed", {
      ...entry,
      status: "skipped",
      note: note || "provider failed",
    });
  }
  if (entry.fallbackStrategy === "retry") {
    const retry = await runProvider(provider, entry, prompt, schemaHint);
    return { ...retry, runtime: runtimeFor(entry, retry, "used", "retry after provider failure") };
  }
  return fallbackToMock(reg, entry, prompt, schemaHint, note || "provider failed");
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

  const primary = reg[entry.provider] ?? reg.mock;
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

  if (entry.fallbackStrategy === "skip") {
    throw new AgentSkippedError(name, "provider returned invalid JSON", {
      ...entry,
      status: "skipped",
      note: "provider returned invalid JSON",
    });
  }
  if (entry.fallbackStrategy === "retry") {
    const retry = await runProvider(primary, entry, prompt, schemaHint);
    return { ...retry, runtime: runtimeFor(entry, retry, "used", "retry after invalid JSON") };
  }
  return fallbackToMock(reg, entry, prompt, schemaHint, "provider returned invalid JSON");
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
