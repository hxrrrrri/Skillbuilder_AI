// Chat provider resolution + turn execution for the copilot.
//
// The copilot uses the SAME provider registry as the rest of SkillProof AI.
// There is NO fake/heuristic fallback: if no configured provider is reachable,
// we fail closed with a provider_not_ready error and setup instructions. The
// model is asked to reply in a small JSON envelope so it can optionally request
// a tool; the envelope is parsed with the existing tolerant JSON parser.

import { buildProviderRegistry } from "@/lib/providers/provider-router";
import { parseProviderJson } from "@/lib/providers/json";
import { defaultModelForProvider } from "@/lib/providers/model-catalog";
import { listProviderConfigs } from "@/lib/providers/registry";
import type { LLMProvider, ProviderId } from "@/lib/providers/types";

// Order we try when the admin hasn't pinned a chat provider. API first (cheap to
// probe), then local CLIs, then Ollama. Deterministic is never used for chat.
const CHAT_PROVIDER_PREFERENCE: ProviderId[] = ["anthropic_api", "claude_cli", "codex_cli", "copilot_cli", "ollama"];

export class CopilotProviderNotReadyError extends Error {
  code = "provider_not_ready" as const;
  fix: string;
  route = "/admin/providers/health";
  tried: ProviderId[];
  constructor(tried: ProviderId[], fix?: string) {
    super("No chat provider is ready.");
    this.name = "CopilotProviderNotReadyError";
    this.tried = tried;
    this.fix =
      fix ||
      "Configure and health-test at least one provider (Anthropic API, Claude CLI, Codex CLI, Copilot CLI, or Ollama) in Admin → Providers → Health.";
  }
}

export type ResolvedChatProvider = {
  providerId: ProviderId;
  model: string;
  provider: LLMProvider;
};

/**
 * Resolve a ready chat provider. `requested` (admin's preferred provider) is tried
 * first; otherwise the preference order is used. Availability is decided by the
 * provider's own `available()` (same gate as the pipeline). Fails closed.
 */
export async function resolveChatProvider(requested?: string | null): Promise<ResolvedChatProvider> {
  const reg = await buildProviderRegistry();
  const rows = await listProviderConfigs().catch(() => [] as any[]);
  const rowById = new Map((rows as any[]).map((r) => [r.providerId, r]));

  const requestedProvider = requested && requested in reg && requested !== "deterministic" ? (requested as ProviderId) : null;
  const order: ProviderId[] = requestedProvider ? [requestedProvider] : CHAT_PROVIDER_PREFERENCE;

  const tried: ProviderId[] = [];
  for (const id of order) {
    const provider = reg[id];
    if (!provider) continue;
    const row = rowById.get(id);
    if (row && row.enabled === false) continue;
    tried.push(id);
    if (row?.lastTestStatus !== "ok" || row?.lastTestJsonOk !== true) continue;
    if (await provider.available()) {
      const model = defaultModelForProvider(id, row?.defaultModel ?? null);
      return { providerId: id, model, provider };
    }
  }
  throw new CopilotProviderNotReadyError(tried);
}

export type ChatEnvelope = {
  reply: string;
  citations?: string[];
  tool_request?: { name: string; input?: Record<string, unknown> } | null;
};

const CHAT_SCHEMA_HINT =
  '{"reply": string, "citations": string[] (optional doc paths), "tool_request": {"name": string, "input": object} | null}';

export type ChatTurnResult = {
  providerId: ProviderId;
  model: string;
  envelope: ChatEnvelope;
  raw: string;
};

/**
 * Run one model turn. Returns the parsed envelope. If the provider cannot return
 * usable JSON, surfaces the provider error (no fabricated answer).
 */
export async function runChatTurn(opts: {
  resolved: ResolvedChatProvider;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<ChatTurnResult> {
  const result = await opts.resolved.provider.runJson(
    {
      system: opts.system,
      user: opts.user,
      maxTokens: opts.maxTokens ?? 1200,
      temperature: 0.2,
      model: opts.resolved.model,
      reasoningBudget: "none",
    },
    CHAT_SCHEMA_HINT,
  );

  const parsed = (result.json ?? parseProviderJson(result.raw)) as ChatEnvelope | null;
  const envelope: ChatEnvelope = parsed && typeof parsed.reply === "string"
    ? {
        reply: parsed.reply,
        citations: Array.isArray(parsed.citations) ? parsed.citations.slice(0, 8).map(String) : undefined,
        tool_request:
          parsed.tool_request && typeof (parsed.tool_request as any).name === "string"
            ? { name: (parsed.tool_request as any).name, input: (parsed.tool_request as any).input ?? {} }
            : null,
      }
    : { reply: (result.raw || "").slice(0, 4000), tool_request: null };

  return { providerId: opts.resolved.providerId, model: result.model || opts.resolved.model, envelope, raw: result.raw };
}
