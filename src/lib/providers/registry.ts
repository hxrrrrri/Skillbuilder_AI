/**
 * DB-backed provider + agent registry.
 *
 * The database registry is the primary runtime source. skillproof.local.json is
 * only a local fallback/override when DB rows are unavailable.
 *
 * Source of truth for defaults: PIPELINE in src/agents/mission-runner.ts and
 * DEFAULTS in src/lib/providers/config.ts. The seed function below mirrors
 * both into the DB so the admin UI is meaningful on first run.
 */

import { prisma } from "@/lib/db";
import type { FallbackStrategy, ProviderId, ProviderMatrixAgentEntry } from "./types";
import { REASONING_BUDGETS, isReasoningBudget, type ReasoningBudget } from "./reasoning";
import { PROVIDER_MODEL_CATALOG, PROVIDER_MODEL_DEFAULTS, LLM_AGENT_NAMES } from "./defaults";
import { providerCache, invalidateProviderRegistryCache } from "./cache";

export const PROVIDER_DEFAULTS: Array<{
  providerId: ProviderId;
  label: string;
  kind: "api" | "cli" | "local" | "deterministic";
  defaultModel: string | null;
  apiKeyEnv: string | null;
  command: string | null;
  baseUrl: string | null;
  capabilities: {
    reasoning: boolean;
    jsonMode: boolean;
    streaming: boolean;
    models: string[];
  };
}> = [
  {
    providerId: "anthropic_api",
    label: "Anthropic API",
    kind: "api",
    defaultModel: PROVIDER_MODEL_DEFAULTS.anthropic_api,
    apiKeyEnv: "ANTHROPIC_API_KEY",
    command: null,
    baseUrl: null,
    capabilities: {
      reasoning: true,
      jsonMode: true,
      streaming: true,
      models: PROVIDER_MODEL_CATALOG.anthropic_api,
    },
  },
  {
    providerId: "claude_cli",
    label: "Claude CLI",
    kind: "cli",
    defaultModel: null,
    apiKeyEnv: null,
    command: "claude",
    baseUrl: null,
    capabilities: { reasoning: false, jsonMode: true, streaming: false, models: PROVIDER_MODEL_CATALOG.claude_cli },
  },
  {
    providerId: "codex_cli",
    label: "Codex CLI",
    kind: "cli",
    defaultModel: null,
    apiKeyEnv: null,
    command: "codex",
    baseUrl: null,
    capabilities: { reasoning: false, jsonMode: true, streaming: false, models: PROVIDER_MODEL_CATALOG.codex_cli },
  },
  {
    providerId: "copilot_cli",
    label: "Copilot CLI",
    kind: "cli",
    defaultModel: null,
    apiKeyEnv: null,
    command: "copilot",
    baseUrl: null,
    capabilities: { reasoning: true, jsonMode: true, streaming: false, models: PROVIDER_MODEL_CATALOG.copilot_cli },
  },
  {
    providerId: "ollama",
    label: "Ollama (local)",
    kind: "local",
    defaultModel: PROVIDER_MODEL_DEFAULTS.ollama,
    apiKeyEnv: null,
    command: null,
    baseUrl: "http://localhost:11434",
    capabilities: {
      reasoning: false,
      jsonMode: true,
      streaming: true,
      models: PROVIDER_MODEL_CATALOG.ollama,
    },
  },
  {
    providerId: "deterministic",
    label: "Deterministic evidence",
    kind: "deterministic",
    defaultModel: PROVIDER_MODEL_DEFAULTS.deterministic,
    apiKeyEnv: null,
    command: null,
    baseUrl: null,
    capabilities: { reasoning: false, jsonMode: true, streaming: false, models: PROVIDER_MODEL_CATALOG.deterministic },
  },
];

export const AGENT_NAMES = [
  "orchestrator",
  "repo-scanner",
  "architecture",
  "code-quality",
  "testing",
  "security",
  "ai-collaboration",
  "git-evidence",
  "documentation",
  "authenticity",
  "interview-gen",
  "answer-evaluator",
  "ai-collaboration-evaluator",
  "validator",
  "skill-graph",
  "profile-gen",
  "employer-verifier",
  "improvement-plan",
] as const;

export type AgentName = (typeof AGENT_NAMES)[number];

type AgentDefault = {
  agentName: AgentName;
  providerId: ProviderId;
  model: string;
  reasoningBudget: ReasoningBudget;
  temperature: number;
  maxTokens: number;
  jsonMode: boolean;
  fallbackProvider: ProviderId | null;
  fallbackStrategy: "retry" | "fail" | "skip_optional";
  costTier: "low" | "medium" | "high";
  qualityTier: "low" | "medium" | "high";
  enabled: boolean;
};

export type ResolvedAgentConfig = ProviderMatrixAgentEntry & {
  agentName: string;
  source: "db" | "default";
  costTier: "low" | "medium" | "high";
  qualityTier: "low" | "medium" | "high";
};

export const AGENT_DEFAULTS: AgentDefault[] = [
  // High-stakes reasoning agents use Codex CLI by default, with Claude CLI as the retry fallback.
  {
    agentName: "orchestrator",
    providerId: "codex_cli",
    model: "gpt-5.5",
    reasoningBudget: "high",
    temperature: 0.1,
    maxTokens: 2000,
    jsonMode: true,
    fallbackProvider: "claude_cli",
    fallbackStrategy: "retry",
    costTier: "high",
    qualityTier: "high",
    enabled: true,
  },
  {
    agentName: "validator",
    providerId: "codex_cli",
    model: "gpt-5.5",
    reasoningBudget: "high",
    temperature: 0.0,
    maxTokens: 2500,
    jsonMode: true,
    fallbackProvider: "claude_cli",
    fallbackStrategy: "retry",
    costTier: "high",
    qualityTier: "high",
    enabled: true,
  },
  // Worker agents default to Codex CLI, retrying once through Claude CLI if needed.
  ...LLM_AGENT_NAMES.filter((name) => name !== "orchestrator" && name !== "validator").map<AgentDefault>((name) => ({
    agentName: name,
    providerId: "codex_cli",
    model: "gpt-5.5",
    reasoningBudget: "medium",
    temperature: 0.2,
    maxTokens: 1500,
    jsonMode: true,
    fallbackProvider: "claude_cli",
    fallbackStrategy: "retry",
    costTier: "medium",
    qualityTier: "medium",
    enabled: true,
  })),
  // Evidence-derived stages still execute deterministic code paths, but the admin registry defaults every agent card to Codex.
  {
    agentName: "repo-scanner",
    providerId: "codex_cli",
    model: "gpt-5.5",
    reasoningBudget: "none",
    temperature: 0,
    maxTokens: 100,
    jsonMode: true,
    fallbackProvider: "claude_cli",
    fallbackStrategy: "retry",
    costTier: "low",
    qualityTier: "low",
    enabled: true,
  },
  {
    agentName: "git-evidence",
    providerId: "codex_cli",
    model: "gpt-5.5",
    reasoningBudget: "none",
    temperature: 0,
    maxTokens: 100,
    jsonMode: true,
    fallbackProvider: "claude_cli",
    fallbackStrategy: "retry",
    costTier: "low",
    qualityTier: "low",
    enabled: true,
  },
  {
    agentName: "skill-graph",
    providerId: "codex_cli",
    model: "gpt-5.5",
    reasoningBudget: "none",
    temperature: 0,
    maxTokens: 100,
    jsonMode: true,
    fallbackProvider: "claude_cli",
    fallbackStrategy: "retry",
    costTier: "low",
    qualityTier: "low",
    enabled: true,
  },
];

// --------------- Provider accessors ---------------

export async function listProviderConfigs() {
  // Hot path: read on every analyze (via provider-router) + readiness check.
  return providerCache.getOrLoad("providers:list", () =>
    prisma.providerConfig.findMany({ orderBy: { providerId: "asc" } }),
  );
}

export async function getProviderConfig(providerId: string) {
  return prisma.providerConfig.findUnique({ where: { providerId } });
}

export async function updateProviderConfig(
  providerId: string,
  patch: Partial<{
    enabled: boolean;
    defaultModel: string | null;
    baseUrl: string | null;
    command: string | null;
    argsTemplate: string | null;
    apiKeyEnv: string | null;
    notes: string | null;
  }>,
) {
  const updated = await prisma.providerConfig.update({
    where: { providerId },
    data: patch,
  });
  invalidateProviderRegistryCache();
  return updated;
}

export async function recordProviderTest(
  providerId: string,
  result: {
    status: "ok" | "fail" | "unavailable";
    model?: string | null;
    error?: string | null;
    raw?: string | null;
    jsonOk?: boolean | null;
    latencyMs?: number | null;
  },
) {
  const updated = await prisma.providerConfig.update({
    where: { providerId },
    data: {
      lastTestedAt: new Date(),
      lastTestStatus: result.status,
      lastTestModel: result.model ?? null,
      lastTestRaw: result.raw ? result.raw.slice(0, 4000) : null,
      lastTestJsonOk: result.jsonOk ?? null,
      lastTestLatencyMs: result.latencyMs ?? null,
      lastTestError: result.error ?? null,
    },
  });
  // Readiness blockers key off lastTestStatus/lastTestJsonOk — bust the memo.
  invalidateProviderRegistryCache();
  return updated;
}

// --------------- Agent accessors ---------------

export async function listAgentConfigs() {
  return prisma.agentConfig.findMany({ orderBy: { agentName: "asc" } });
}

export async function getAgentConfig(agentName: string) {
  return prisma.agentConfig.findUnique({ where: { agentName } });
}

const PROVIDER_IDS = PROVIDER_DEFAULTS.map((p) => p.providerId);

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

function defaultForAgent(agentName: string): AgentDefault {
  const known = AGENT_DEFAULTS.find((a) => a.agentName === agentName);
  if (known) return known;
  return {
    agentName: agentName as AgentName,
    providerId: "codex_cli",
    model: "gpt-5.5",
    reasoningBudget: "none",
    temperature: 0,
    maxTokens: 1500,
    jsonMode: true,
    fallbackProvider: "claude_cli",
    fallbackStrategy: "retry",
    costTier: "low",
    qualityTier: "low",
    enabled: true,
  };
}

function coerceTier(value: unknown): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function normalizeAgentConfig(
  row: {
    agentName: string;
    providerId: string;
    model: string;
    reasoningBudget: string;
    temperature: number;
    maxTokens: number;
    jsonMode: boolean;
    fallbackProvider: string | null;
    fallbackModel?: string | null;
    fallbackStrategy: string;
    timeoutMs?: number;
    retryCount?: number;
    enabled: boolean;
    costTier?: string;
    qualityTier?: string;
  },
  source: "db" | "default",
): ResolvedAgentConfig {
  const fallback = defaultForAgent(row.agentName);
  const providerId = isProviderId(row.providerId) ? row.providerId : fallback.providerId;
  const fallbackProvider =
    row.fallbackProvider && isProviderId(row.fallbackProvider) ? row.fallbackProvider : null;
  const fallbackStrategy: FallbackStrategy = isFallbackStrategy(row.fallbackStrategy)
    ? row.fallbackStrategy
    : fallback.fallbackStrategy;
  return {
    agentName: row.agentName,
    provider: providerId,
    model: row.model || fallback.model,
    reasoningBudget: isReasoningBudget(row.reasoningBudget) ? row.reasoningBudget : fallback.reasoningBudget,
    enabled: row.enabled,
    fallbackProvider,
    fallbackModel: row.fallbackModel ?? null,
    fallbackStrategy,
    temperature: Number.isFinite(row.temperature) ? row.temperature : fallback.temperature,
    maxTokens: Number.isFinite(row.maxTokens) ? row.maxTokens : fallback.maxTokens,
    jsonMode: row.jsonMode,
    timeoutMs: Number.isFinite(row.timeoutMs) ? row.timeoutMs! : 60_000,
    retryCount: Number.isFinite(row.retryCount) ? row.retryCount! : 1,
    costTier: coerceTier(row.costTier ?? fallback.costTier),
    qualityTier: coerceTier(row.qualityTier ?? fallback.qualityTier),
    source,
    status: "planned",
  };
}

export async function resolveAgentConfig(agentName: string): Promise<ResolvedAgentConfig> {
  // Hot path: resolved once per agent (18) on every analyze via the matrix.
  return providerCache.getOrLoad(`agent:${agentName}`, async () => {
    try {
      const existing = await getAgentConfig(agentName);
      if (existing) return normalizeAgentConfig(existing, "db");
    } catch (err) {
      console.error("[provider-registry] failed to resolve agent config", agentName, err);
    }
    const fallback = defaultForAgent(agentName);
    return normalizeAgentConfig(
      {
        ...fallback,
        fallbackModel: null,
        timeoutMs: 60_000,
        retryCount: 1,
      },
      "default",
    );
  });
}

export async function updateAgentConfig(
  agentName: string,
  patch: Partial<{
    providerId: string;
    model: string;
    reasoningBudget: ReasoningBudget;
    temperature: number;
    maxTokens: number;
    jsonMode: boolean;
    fallbackProvider: string | null;
    fallbackModel: string | null;
    fallbackStrategy: "retry" | "fail" | "skip_optional";
    timeoutMs: number;
    retryCount: number;
    enabled: boolean;
    costTier: "low" | "medium" | "high";
    qualityTier: "low" | "medium" | "high";
  }>,
) {
  const updated = await prisma.agentConfig.update({ where: { agentName }, data: patch });
  invalidateProviderRegistryCache();
  return updated;
}

// --------------- Seeding ---------------

export async function seedRegistry(options: { force?: boolean } = {}): Promise<{
  providers: { created: number; updated: number };
  agents: { created: number; updated: number };
}> {
  await prisma.providerConfig.deleteMany({ where: { providerId: "mock" } });
  if (options.force) {
    await prisma.agentConfig.updateMany({
      where: { providerId: "mock" },
      data: {
        providerId: "codex_cli",
        model: "gpt-5.5",
        fallbackProvider: "claude_cli",
        fallbackStrategy: "retry",
      },
    });
    await prisma.agentConfig.updateMany({
      where: { fallbackProvider: "mock" },
      data: { fallbackProvider: null, fallbackStrategy: "fail" },
    });
  }
  let providersCreated = 0;
  let providersUpdated = 0;
  for (const p of PROVIDER_DEFAULTS) {
    const existing = await prisma.providerConfig.findUnique({ where: { providerId: p.providerId } });
    const data = {
      label: p.label,
      kind: p.kind,
      defaultModel: p.defaultModel,
      baseUrl: p.baseUrl,
      command: p.command,
      apiKeyEnv: p.apiKeyEnv,
      capabilities: JSON.stringify(p.capabilities),
    };
    if (!existing) {
      await prisma.providerConfig.create({
        data: { providerId: p.providerId, enabled: true, ...data },
      });
      providersCreated++;
    } else if (options.force) {
      await prisma.providerConfig.update({
        where: { providerId: p.providerId },
        data: {
          ...data,
          lastTestedAt: null,
          lastTestStatus: null,
          lastTestModel: null,
          lastTestRaw: null,
          lastTestJsonOk: null,
          lastTestLatencyMs: null,
          lastTestError: null,
        },
      });
      providersUpdated++;
    }
  }

  let agentsCreated = 0;
  let agentsUpdated = 0;
  for (const a of AGENT_DEFAULTS) {
    const existing = await prisma.agentConfig.findUnique({ where: { agentName: a.agentName } });
    const data = {
      providerId: a.providerId,
      model: a.model,
      reasoningBudget: a.reasoningBudget,
      temperature: a.temperature,
      maxTokens: a.maxTokens,
      jsonMode: a.jsonMode,
      fallbackProvider: a.fallbackProvider,
      fallbackStrategy: a.fallbackStrategy,
      costTier: a.costTier,
      qualityTier: a.qualityTier,
      enabled: a.enabled,
    };
    if (!existing) {
      await prisma.agentConfig.create({ data: { agentName: a.agentName, ...data } });
      agentsCreated++;
    } else if (options.force) {
      await prisma.agentConfig.update({ where: { agentName: a.agentName }, data });
      agentsUpdated++;
    }
  }

  invalidateProviderRegistryCache();
  return {
    providers: { created: providersCreated, updated: providersUpdated },
    agents: { created: agentsCreated, updated: agentsUpdated },
  };
}

// --------------- Validation helpers ---------------

export const FALLBACK_STRATEGIES = ["retry", "fail", "skip_optional"] as const;
export const COST_TIERS = ["low", "medium", "high"] as const;
export const QUALITY_TIERS = ["low", "medium", "high"] as const;

export function isFallbackStrategy(v: unknown): v is (typeof FALLBACK_STRATEGIES)[number] {
  return typeof v === "string" && (FALLBACK_STRATEGIES as readonly string[]).includes(v);
}

export function isCostTier(v: unknown): v is (typeof COST_TIERS)[number] {
  return typeof v === "string" && (COST_TIERS as readonly string[]).includes(v);
}

export function isQualityTier(v: unknown): v is (typeof QUALITY_TIERS)[number] {
  return typeof v === "string" && (QUALITY_TIERS as readonly string[]).includes(v);
}

export { REASONING_BUDGETS };
export {
  PROMPT_MAX_LENGTH,
  PromptValidationError,
  activatePromptVersion,
  createPromptVersion,
  getActivePrompt,
  listPromptVersions,
  validatePromptContent,
} from "./prompts";
