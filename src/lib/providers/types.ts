// Provider mesh shared types.

import type { ProviderReasoningMapping, ReasoningBudget } from "./reasoning";

export type ProviderId =
  | "anthropic_api"
  | "claude_cli"
  | "codex_cli"
  | "ollama"
  | "copilot_cli"
  | "deterministic";

export type AgentRole = "orchestrator" | "worker" | "validator" | "interview" | "profile";
export type FallbackStrategy = "retry" | "fail" | "skip_optional";
export type RuntimeResolutionSource = "db" | "default" | "file" | "deterministic";
export type RuntimeResolutionStatus = "planned" | "used" | "fallback" | "skipped" | "failed";
export type ProviderHealthStatus =
  | "ready"
  | "installed_not_authenticated"
  | "missing_binary"
  | "invalid_command"
  | "invalid_json"
  | "unsupported_for_scoring"
  | "disabled"
  | "failed";

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
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  command?: string;
  latencyMs?: number;
};

export interface LLMProvider {
  id: ProviderId;
  label: string;
  available(): Promise<boolean>;
  runJson(prompt: ProviderPrompt, schemaHint: string): Promise<ProviderResult>;
  health?(): Promise<ProviderHealth>;
}

export type ProviderHealth = {
  providerId: ProviderId;
  label: string;
  status: ProviderHealthStatus;
  enabled: boolean;
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  supportsJson: boolean;
  supportsNonInteractive: boolean;
  supportsModelSelection: boolean;
  supportsReasoningBudget: boolean;
  availableModels: string[];
  configuredModel: string | null;
  lastTestedAt?: string | null;
  lastLatencyMs?: number | null;
  lastRawOutputPreview?: string | null;
  lastError?: string | null;
  fix: string;
  command: string | null;
  exitCode?: number | null;
  rawOutputPreview?: string | null;
};

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
  agentName?: string;
  plannedInputTokens?: number;
  plannedOutputTokens?: number;
  estimatedInputTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  actualOutputTokens?: number;
  budgetExceeded?: boolean;
  compressionRatio?: number;
  contextStrategy?: "minimal" | "focused" | "broad" | "validator" | "none";
  modelTier?: "deterministic" | "cheap" | "balanced" | "strong";
  modelReason?: string;
  contextTruncated?: boolean;
  promptTruncated?: boolean;
};

export type ProviderMatrix = Record<AgentRole, ProviderId> & {
  agents?: Record<string, ProviderMatrixAgentEntry>;
};
