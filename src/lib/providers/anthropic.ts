// Anthropic API provider — wraps existing llmCall.

import { llmCall } from "@/lib/claude";
import type { LLMProvider, ProviderHealth, ProviderPrompt, ProviderResult } from "./types";
import { mapReasoningBudget } from "./reasoning";
import { jsonRepairPrompt, parseProviderJson } from "./json";
import { ProviderExecutionError, ProviderInvalidJsonError } from "./errors";
import { PROVIDER_MODEL_CATALOG } from "./model-catalog";

const ANTHROPIC_MODELS = PROVIDER_MODEL_CATALOG.anthropic_api;

function classifyAnthropicError(err: unknown, model: string): ProviderExecutionError {
  const anyErr = err as any;
  const status = anyErr?.status ?? anyErr?.response?.status;
  const message = anyErr?.message ?? String(err);
  const lower = message.toLowerCase();
  if (status === 401 || status === 403 || /api key|auth|unauthorized|forbidden/.test(lower)) {
    return new ProviderExecutionError({
      provider: "anthropic_api",
      code: "provider_not_authenticated",
      message: `Anthropic API authentication failed: ${message}`,
      fix: "Set a valid ANTHROPIC_API_KEY and rerun the provider health test.",
    });
  }
  if (status === 404 || /model|not found|invalid model/.test(lower)) {
    return new ProviderExecutionError({
      provider: "anthropic_api",
      code: "provider_unavailable",
      message: `Anthropic model '${model}' is unavailable: ${message}`,
      fix: "Choose an available Anthropic model in Admin -> Providers and rerun the health test.",
    });
  }
  if (status === 429 || /rate limit|overloaded|quota/.test(lower)) {
    return new ProviderExecutionError({
      provider: "anthropic_api",
      code: "provider_unavailable",
      message: `Anthropic API is rate limited: ${message}`,
      fix: "Wait for rate limits to reset or switch the affected agent to another ready real provider.",
    });
  }
  return new ProviderExecutionError({
    provider: "anthropic_api",
    code: "provider_execution_failed",
    message: `Anthropic API request failed: ${message}`,
    fix: "Run the provider health test and verify API key, model, and account limits.",
  });
}

export function makeAnthropicApiProvider(opts: { enabled?: boolean; defaultModel?: string | null } = {}): LLMProvider {
  return {
    id: "anthropic_api",
    label: "Anthropic API",
    async available() {
      return opts.enabled !== false && !!process.env.ANTHROPIC_API_KEY;
    },
    async health(): Promise<ProviderHealth> {
      const enabled = opts.enabled !== false;
      const hasKey = !!process.env.ANTHROPIC_API_KEY;
      return {
        providerId: "anthropic_api",
        label: "Anthropic API",
        status: !enabled ? "disabled" : hasKey ? "ready" : "installed_not_authenticated",
        enabled,
        installed: true,
        authenticated: hasKey,
        version: "sdk",
        supportsJson: true,
        supportsNonInteractive: true,
        supportsModelSelection: true,
        supportsReasoningBudget: true,
        availableModels: ANTHROPIC_MODELS,
        configuredModel: opts.defaultModel ?? null,
        lastError: hasKey ? null : "ANTHROPIC_API_KEY is missing",
        fix: hasKey ? "API key configured." : "Set ANTHROPIC_API_KEY and rerun Admin -> Providers -> Test.",
        command: "Anthropic SDK messages.create",
      };
    },
    async runJson(prompt: ProviderPrompt, schemaHint: string): Promise<ProviderResult> {
      const sys = `${prompt.system}\n\nRespond with valid JSON only, matching: ${schemaHint}`;
      const reasoning = mapReasoningBudget("anthropic_api", prompt.reasoningBudget ?? "none");
      const model = prompt.model ?? opts.defaultModel ?? undefined;
      const call = async (user: string) => {
        try {
          return await llmCall({
            role: "worker",
            system: sys,
            user,
            maxTokens: prompt.maxTokens,
            temperature: prompt.temperature,
            model,
            thinkingBudgetTokens:
              reasoning.kind === "anthropic_thinking" && reasoning.budgetTokens !== null
                ? reasoning.budgetTokens
                : null,
          });
        } catch (err) {
          throw classifyAnthropicError(err, model ?? "default");
        }
      };
      const res = await call(prompt.user);
      const firstJson = parseProviderJson(res.text);
      if (firstJson !== null) {
        return {
          json: firstJson,
          raw: res.text,
          stdout: res.text,
          stderr: "",
          exitCode: 0,
          command: "Anthropic SDK messages.create",
          provider: "anthropic_api",
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          model: res.model,
        };
      }
      const repair = await call(jsonRepairPrompt(prompt.user, schemaHint, res.text));
      const repairedJson = parseProviderJson(repair.text);
      if (repairedJson === null) {
        throw new ProviderInvalidJsonError({
          provider: "anthropic_api",
          raw: repair.text,
          result: {
            command: "Anthropic SDK messages.create",
            exitCode: 0,
            stderr: "",
            stdout: repair.text,
            raw: repair.text,
          },
          fix: "The model returned non-JSON twice. Lower temperature, check the prompt version, or switch to a model that passes the JSON contract test.",
        });
      }
      return {
        json: repairedJson,
        raw: repair.text,
        stdout: repair.text,
        stderr: "",
        exitCode: 0,
        command: "Anthropic SDK messages.create",
        provider: "anthropic_api",
        inputTokens: res.inputTokens + repair.inputTokens,
        outputTokens: res.outputTokens + repair.outputTokens,
        model: repair.model,
      };
    },
  };
}

export const anthropicApiProvider: LLMProvider = makeAnthropicApiProvider();
