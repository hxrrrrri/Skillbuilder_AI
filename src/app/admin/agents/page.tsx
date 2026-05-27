import { requireAdminPage } from "@/lib/auth/guards";
import {
  listAgentConfigs,
  listProviderConfigs,
  REASONING_BUDGETS,
  FALLBACK_STRATEGIES,
  COST_TIERS,
  QUALITY_TIERS,
} from "@/lib/providers/registry";
import { mapReasoningBudget, reasoningSupportedByProvider } from "@/lib/providers/reasoning";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ADMIN_NAV } from "../_nav";
import { AgentTable } from "./agent-table";
import type { ProviderId } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

export default async function AdminAgentsPage() {
  await requireAdminPage("/admin/agents");

  const [agents, providers] = await Promise.all([listAgentConfigs(), listProviderConfigs()]);

  const providerOptions = providers.map((p) => ({
    id: p.providerId,
    label: p.label,
    enabled: p.enabled,
    defaultModel: p.defaultModel,
    capabilities: safeJson(p.capabilities) as {
      reasoning?: boolean;
      models?: string[];
    } | null,
    reasoningSupported: reasoningSupportedByProvider(p.providerId as ProviderId),
  }));

  const rows = agents.map((a) => {
    const mapping = mapReasoningBudget(a.providerId as ProviderId, a.reasoningBudget as any);
    return {
      id: a.id,
      agentName: a.agentName,
      providerId: a.providerId,
      model: a.model,
      reasoningBudget: a.reasoningBudget,
      temperature: a.temperature,
      maxTokens: a.maxTokens,
      jsonMode: a.jsonMode,
      fallbackProvider: a.fallbackProvider,
      fallbackModel: a.fallbackModel,
      fallbackStrategy: a.fallbackStrategy,
      timeoutMs: a.timeoutMs,
      retryCount: a.retryCount,
      enabled: a.enabled,
      costTier: a.costTier,
      qualityTier: a.qualityTier,
      updatedAt: a.updatedAt.toISOString(),
      reasoningMappingKind: mapping.kind,
      reasoningMappingDetail:
        mapping.kind === "anthropic_thinking"
          ? mapping.budgetTokens === null
            ? "off"
            : `${mapping.budgetTokens} tokens`
          : mapping.kind === "openai_effort"
          ? mapping.effort ?? "off"
          : mapping.reason,
    };
  });

  return (
    <RoleShell
      title="Agents"
      subtitle="Per-agent provider, model, reasoning budget, fallback, and limits. Changes are persisted and audited."
      navLinks={ADMIN_NAV}
      activeHref="/admin/agents"
    >
      {rows.length === 0 ? (
        <Card>
          <CardBody>
            <ScaffoldNotice detail="Agent registry is empty. Run `npm run db:seed-registry` to populate defaults." />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Effective runtime config ({rows.length})</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-3 text-xs text-muted">
              These rows are read from the database registry at runtime. Local JSON can only fill gaps when registry rows are missing.
            </p>
            <AgentTable
              rows={rows}
              providers={providerOptions}
              reasoningBudgets={[...REASONING_BUDGETS]}
              fallbackStrategies={[...FALLBACK_STRATEGIES]}
              costTiers={[...COST_TIERS]}
              qualityTiers={[...QUALITY_TIERS]}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Reasoning budget abstraction</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-muted">
            The reasoning budget ladder is provider-neutral. Each provider adapter maps it to its native control:
          </p>
          <ul className="mt-2 list-disc pl-5 text-xs text-muted">
            <li>
              <code className="rounded bg-panel2 px-1">anthropic_api</code> → extended-thinking token budget:{" "}
              none / 1024 / 4096 / 16384 / 32768.
            </li>
            <li>
              <code className="rounded bg-panel2 px-1">openai_api</code> → reasoning effort:{" "}
              none / low / medium / high / high (planned).
            </li>
            <li>
              <code className="rounded bg-panel2 px-1">claude_cli / codex_cli / copilot_cli / ollama / mock</code> →
              not supported (the budget is recorded but has no runtime effect for these providers).
            </li>
          </ul>
        </CardBody>
      </Card>
    </RoleShell>
  );
}

function safeJson(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
