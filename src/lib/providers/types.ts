// Provider mesh shared types.

export type ProviderId =
  | "anthropic_api"
  | "claude_cli"
  | "codex_cli"
  | "ollama"
  | "copilot_cli"
  | "mock";

export type AgentRole = "orchestrator" | "worker" | "validator" | "interview" | "profile";

export type ProviderPrompt = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
};

export type ProviderResult = {
  json: any | null;
  raw: string;
  provider: ProviderId;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export interface LLMProvider {
  id: ProviderId;
  label: string;
  available(): Promise<boolean>;
  runJson(prompt: ProviderPrompt, schemaHint: string): Promise<ProviderResult>;
}

export type ProviderMatrix = Record<AgentRole, ProviderId>;
