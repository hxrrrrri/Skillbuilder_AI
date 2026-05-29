import type { ProviderId } from "./types";

export const PROVIDER_MODEL_CATALOG: Record<ProviderId, string[]> = {
  anthropic_api: [
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
  ],
  claude_cli: [
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "opus",
    "sonnet",
  ],
  codex_cli: ["gpt-5.5"],
  copilot_cli: ["claude-haiku-4.5"],
  ollama: ["llama3.2:latest", "llama3:latest", "gemma4:31b-cloud", "gemma3:4b", "gemma4:e2b"],
  deterministic: ["repo-scanner", "git-evidence", "skill-graph", "evidence-derived"],
};

export const PROVIDER_MODEL_DEFAULTS: Record<ProviderId, string | null> = {
  anthropic_api: "claude-sonnet-4-6",
  claude_cli: null,
  codex_cli: null,
  copilot_cli: null,
  ollama: "llama3.2:latest",
  deterministic: "evidence-derived",
};

export const ROLE_MODEL_DEFAULTS = {
  orchestrator: "claude-opus-4-7",
  worker: "claude-sonnet-4-6",
  validator: "claude-opus-4-7",
} as const;

export const DETERMINISTIC_AGENT_NAMES = ["repo-scanner", "git-evidence", "skill-graph"] as const;

export const LLM_AGENT_NAMES = [
  "orchestrator",
  "architecture",
  "code-quality",
  "testing",
  "security",
  "ai-collaboration",
  "documentation",
  "authenticity",
  "interview-gen",
  "answer-evaluator",
  "ai-collaboration-evaluator",
  "validator",
  "profile-gen",
  "employer-verifier",
  "improvement-plan",
] as const;

export function isDeterministicOnlyAgent(agentName: string) {
  return (DETERMINISTIC_AGENT_NAMES as readonly string[]).includes(agentName);
}
