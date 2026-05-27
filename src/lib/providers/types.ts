// Provider mesh shared types.

import type { ProviderReasoningMapping, ReasoningBudget } from "./reasoning";

export type ProviderId =
  | "anthropic_api"
  | "claude_cli"
  | "codex_cli"
  | "ollama"
  | "copilot_cli"
  | "mock";

export type AgentRole = "orchestrator" | "worker" | "validator" | "interview" | "profile";
export type FallbackStrategy = "mock" | "retry" | "skip";
export type RuntimeResolutionSource = "db" | "default" | "file" | "mock";
export type RuntimeResolutionStatus = "planned" | "used" | "fallback" | "skipped";

export type ProviderPrompt = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  reasoningBudget?: ReasoningBudget;
  agentName?: string;
};

export type ProviderResult = {
  json: any | null;
  raw: string;
  provider: ProviderId;
  inputTokens: number;
  outputTokens: number;
  model: string;
  runtime?: ProviderMatrixAgentEntry;
};

export interface LLMProvider {
  id: ProviderId;
  label: string;
  available(): Promise<boolean>;
  runJson(prompt: ProviderPrompt, schemaHint: string): Promise<ProviderResult>;
}

export type ProviderMatrixAgentEntry = {
  provider: ProviderId;
  model: string;
  reasoningBudget: ReasoningBudget;
  enabled: boolean;
  fallbackProvider: ProviderId | null;
  fallbackModel: string | null;
  fallbackStrategy: FallbackStrategy;
  temperature: number;
  maxTokens: number;
  jsonMode: boolean;
  timeoutMs: number;
  retryCount: number;
  source: RuntimeResolutionSource;
  status?: RuntimeResolutionStatus;
  actualProvider?: ProviderId;
  actualModel?: string;
  requestedProvider?: ProviderId;
  requestedModel?: string;
  reasoning?: ProviderReasoningMapping;
  note?: string;
};

export type ProviderMatrix = Record<AgentRole, ProviderId> & {
  agents?: Record<string, ProviderMatrixAgentEntry>;
};
