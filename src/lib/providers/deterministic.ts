import type { LLMProvider, ProviderHealth, ProviderPrompt, ProviderResult } from "./types";
import { ProviderExecutionError } from "./errors";

export const deterministicProvider: LLMProvider = {
  id: "deterministic",
  label: "Deterministic evidence",
  async available() {
    return true;
  },
  async health(): Promise<ProviderHealth> {
    return {
      providerId: "deterministic",
      label: "Deterministic evidence",
      status: "ready",
      enabled: true,
      installed: true,
      authenticated: true,
      version: "built-in",
      supportsJson: true,
      supportsNonInteractive: true,
      supportsModelSelection: false,
      supportsReasoningBudget: false,
      availableModels: ["repo-scanner", "git-evidence", "skill-graph"],
      configuredModel: "evidence-derived",
      fix: "No setup required. This provider only reports evidence-derived deterministic stages.",
      command: null,
    };
  },
  async runJson(_prompt: ProviderPrompt, _schemaHint: string): Promise<ProviderResult> {
    throw new ProviderExecutionError({
      provider: "deterministic",
      code: "provider_unsupported",
      message: "Deterministic provider cannot generate LLM JSON. Call the evidence-derived agent implementation directly.",
      fix: "Use deterministic only for repo-scanner, git-evidence, and skill-graph code paths.",
    });
  },
};
