import { requireAdminPage } from "@/lib/auth/guards";
import { listProviderConfigs } from "@/lib/providers/registry";
import { listProviderHealth } from "@/lib/providers/provider-router";
import { RoleShell } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ADMIN_NAV } from "../../_nav";
import { ProviderHealthTable } from "./health-table";

export const dynamic = "force-dynamic";

export default async function ProviderHealthPage() {
  await requireAdminPage("/admin/providers/health");
  const [health, configs] = await Promise.all([listProviderHealth(), listProviderConfigs()]);
  const byProvider = new Map(configs.map((p) => [p.providerId, p]));
  const rows = health.map((h) => {
    const row = byProvider.get(h.providerId);
    return {
      providerId: h.providerId,
      label: h.label,
      status: row?.enabled === false ? "disabled" : h.status,
      enabled: row?.enabled ?? h.enabled,
      installed: h.installed,
      authenticated: h.authenticated,
      version: h.version,
      supportsJson: h.supportsJson,
      supportsNonInteractive: h.supportsNonInteractive,
      supportsModelSelection: h.supportsModelSelection,
      supportsReasoningBudget: h.supportsReasoningBudget,
      availableModels: h.availableModels,
      configuredModel: row?.defaultModel ?? h.configuredModel,
      lastTestedAt: row?.lastTestedAt ? row.lastTestedAt.toISOString() : null,
      lastLatencyMs: row?.lastTestLatencyMs ?? h.lastLatencyMs ?? null,
      lastRawOutputPreview: row?.lastTestRaw ?? h.rawOutputPreview ?? h.lastRawOutputPreview ?? null,
      lastError: row?.lastTestError ?? h.lastError ?? null,
      lastTestJsonOk: row?.lastTestJsonOk ?? null,
      fix: h.fix,
      command: row?.command ?? h.command,
      apiKeyEnv: row?.apiKeyEnv ?? null,
      baseUrl: row?.baseUrl ?? null,
      notes: row?.notes ?? null,
    };
  });

  return (
    <RoleShell
      title="Provider Health"
      subtitle="Real provider readiness. Verification runs are blocked until required providers pass JSON contract tests."
      navLinks={ADMIN_NAV}
      activeHref="/admin/providers"
    >
      <Card showTrafficLights className="card-section-plain border-bg bg-transparent shadow-none backdrop-blur-0">
        <CardHeader className="border-bg pl-20">
          <CardTitle>Real Provider Readiness</CardTitle>
        </CardHeader>
        <CardBody>
          <ProviderHealthTable rows={rows} />
        </CardBody>
      </Card>
    </RoleShell>
  );
}
