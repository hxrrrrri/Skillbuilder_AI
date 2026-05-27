/**
 * DB-backed provider + agent registry.
 *
 * This slice introduces persistence and an editable admin UI; the existing
 * runtime (mission-runner / provider-router) still reads from
 * skillproof.local.json. Wiring runtime to this registry is the next slice.
 *
 * Source of truth for defaults: PIPELINE in src/agents/mission-runner.ts and
 * DEFAULTS in src/lib/providers/config.ts. The seed function below mirrors
 * both into the DB so the admin UI is meaningful on first run.
 */

import { prisma } from "@/lib/db";
import type { ProviderId } from "./types";
import { REASONING_BUDGETS, type ReasoningBudget } from "./reasoning";

export const PROVIDER_DEFAULTS: Array<{
  providerId: ProviderId;
  label: string;
  kind: "api" | "cli" | "local" | "mock";
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
    defaultModel: "claude-sonnet-4-6",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    command: null,
    baseUrl: null,
    capabilities: {
      reasoning: true,
      jsonMode: true,
      streaming: true,
      models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
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
    capabilities: { reasoning: false, jsonMode: true, streaming: false, models: [] },
  },
  {
    providerId: "codex_cli",
    label: "Codex CLI",
    kind: "cli",
    defaultModel: null,
    apiKeyEnv: null,
    command: "codex",
    baseUrl: null,
    capabilities: { reasoning: false, jsonMode: true, streaming: false, models: [] },
  },
  {
    providerId: "copilot_cli",
    label: "Copilot CLI",
    kind: "cli",
    defaultModel: null,
    apiKeyEnv: null,
    command: "gh",
    baseUrl: null,
    capabilities: { reasoning: false, jsonMode: false, streaming: false, models: [] },
  },
  {
    providerId: "ollama",
    label: "Ollama (local)",
    kind: "local",
    defaultModel: "llama3.1:8b",
    apiKeyEnv: null,
    command: null,
    baseUrl: "http://localhost:11434",
    capabilities: {
      reasoning: false,
      jsonMode: true,
      streaming: true,
      models: ["llama3.1:8b", "qwen2.5-coder:7b", "deepseek-r1:7b"],
    },
  },
  {
    providerId: "mock",
    label: "Mock / heuristic",
    kind: "mock",
    defaultModel: "mock-1",
    apiKeyEnv: null,
    command: null,
    baseUrl: null,
    capabilities: { reasoning: false, jsonMode: true, streaming: false, models: ["mock-1"] },
  },
];

export const AGENT_NAMES = [
  "orchestrator",
  "repo-scanner",
  "architecture",
  "code-quality",
  "testing",
  "security",
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
  fallbackStrategy: "mock" | "retry" | "skip";
  costTier: "low" | "medium" | "high";
  qualityTier: "low" | "medium" | "high";
  enabled: boolean;
};

export const AGENT_DEFAULTS: AgentDefault[] = [
  // High-stakes reasoning agents → Opus-class + high reasoning.
  {
    agentName: "orchestrator",
    providerId: "anthropic_api",
    model: "claude-opus-4-7",
    reasoningBudget: "high",
    temperature: 0.1,
    maxTokens: 2000,
    jsonMode: true,
    fallbackProvider: "mock",
    fallbackStrategy: "mock",
    costTier: "high",
    qualityTier: "high",
    enabled: true,
  },
  {
    agentName: "validator",
    providerId: "anthropic_api",
    model: "claude-opus-4-7",
    reasoningBudget: "high",
    temperature: 0.0,
    maxTokens: 2500,
    jsonMode: true,
    fallbackProvider: "mock",
    fallbackStrategy: "mock",
    costTier: "high",
    qualityTier: "high",
    enabled: true,
  },
  // Worker agents → Sonnet + medium reasoning.
  ...(
    [
      "architecture",
      "code-quality",
      "testing",
      "security",
      "documentation",
      "authenticity",
      "interview-gen",
      "answer-evaluator",
      "ai-collaboration-evaluator",
      "employer-verifier",
      "improvement-plan",
      "profile-gen",
    ] as const
  ).map<AgentDefault>((name) => ({
    agentName: name,
    providerId: "anthropic_api",
    model: "claude-sonnet-4-6",
    reasoningBudget: "medium",
    temperature: 0.2,
    maxTokens: 1500,
    jsonMode: true,
    fallbackProvider: "mock",
    fallbackStrategy: "mock",
    costTier: "medium",
    qualityTier: "medium",
    enabled: true,
  })),
  // Deterministic / no-LLM stages → mock.
  {
    agentName: "repo-scanner",
    providerId: "mock",
    model: "mock-1",
    reasoningBudget: "none",
    temperature: 0,
    maxTokens: 100,
    jsonMode: true,
    fallbackProvider: null,
    fallbackStrategy: "mock",
    costTier: "low",
    qualityTier: "low",
    enabled: true,
  },
  {
    agentName: "git-evidence",
    providerId: "mock",
    model: "mock-1",
    reasoningBudget: "none",
    temperature: 0,
    maxTokens: 100,
    jsonMode: true,
    fallbackProvider: null,
    fallbackStrategy: "mock",
    costTier: "low",
    qualityTier: "low",
    enabled: true,
  },
  {
    agentName: "skill-graph",
    providerId: "mock",
    model: "mock-1",
    reasoningBudget: "none",
    temperature: 0,
    maxTokens: 100,
    jsonMode: true,
    fallbackProvider: null,
    fallbackStrategy: "mock",
    costTier: "low",
    qualityTier: "low",
    enabled: true,
  },
];

// --------------- Provider accessors ---------------

export async function listProviderConfigs() {
  return prisma.providerConfig.findMany({ orderBy: { providerId: "asc" } });
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
  return prisma.providerConfig.update({
    where: { providerId },
    data: patch,
  });
}

export async function recordProviderTest(
  providerId: string,
  result: { status: "ok" | "fail" | "unavailable"; model?: string | null; error?: string | null },
) {
  return prisma.providerConfig.update({
    where: { providerId },
    data: {
      lastTestedAt: new Date(),
      lastTestStatus: result.status,
      lastTestModel: result.model ?? null,
      lastTestError: result.error ?? null,
    },
  });
}

// --------------- Agent accessors ---------------

export async function listAgentConfigs() {
  return prisma.agentConfig.findMany({ orderBy: { agentName: "asc" } });
}

export async function getAgentConfig(agentName: string) {
  return prisma.agentConfig.findUnique({ where: { agentName } });
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
    fallbackStrategy: "mock" | "retry" | "skip";
    timeoutMs: number;
    retryCount: number;
    enabled: boolean;
    costTier: "low" | "medium" | "high";
    qualityTier: "low" | "medium" | "high";
  }>,
) {
  return prisma.agentConfig.update({ where: { agentName }, data: patch });
}

// --------------- Seeding ---------------

export async function seedRegistry(options: { force?: boolean } = {}): Promise<{
  providers: { created: number; updated: number };
  agents: { created: number; updated: number };
}> {
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
      await prisma.providerConfig.update({ where: { providerId: p.providerId }, data });
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

  return {
    providers: { created: providersCreated, updated: providersUpdated },
    agents: { created: agentsCreated, updated: agentsUpdated },
  };
}

// --------------- Validation helpers ---------------

export const FALLBACK_STRATEGIES = ["mock", "retry", "skip"] as const;
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
