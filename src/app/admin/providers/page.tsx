import { requireAdminPage } from "@/lib/auth/guards";
import { listProviderConfigs } from "@/lib/providers/registry";
import { listProviderAvailability } from "@/lib/providers/provider-router";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV } from "../_nav";
import { ProviderTable } from "./provider-table";
import { modelsForProvider } from "@/lib/providers/model-catalog";

export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  await requireAdminPage("/admin/providers");

  const [providers, availability] = await Promise.all([
    listProviderConfigs(),
    listProviderAvailability(),
  ]);
  const liveAvailability = Object.fromEntries(availability.map((a) => [a.id, a.available]));

  const rows = providers.filter((p) => p.providerId !== "mock").map((p) => {
    const capabilities = parseJson(p.capabilities) as {
      reasoning?: boolean;
      jsonMode?: boolean;
      streaming?: boolean;
      models?: string[];
    } | null;
    return {
      id: p.id,
      providerId: p.providerId,
      label: p.label,
      kind: p.kind,
      enabled: p.enabled,
      defaultModel: p.defaultModel,
      baseUrl: p.baseUrl,
      command: p.command,
      apiKeyEnv: p.apiKeyEnv,
      notes: p.notes,
      capabilities: {
        ...(capabilities ?? {}),
        models: modelsForProvider(p.providerId, capabilities?.models ?? []),
      },
      lastTestedAt: p.lastTestedAt ? p.lastTestedAt.toISOString() : null,
      lastTestStatus: p.lastTestStatus,
      lastTestModel: p.lastTestModel,
      lastTestRaw: p.lastTestRaw,
      lastTestJsonOk: p.lastTestJsonOk,
      lastTestLatencyMs: p.lastTestLatencyMs,
      lastTestError: p.lastTestError,
      liveAvailable: !!liveAvailability[p.providerId],
    };
  });

  const apiKeyPresent = !!process.env.ANTHROPIC_API_KEY;

  return (
    <RoleShell
      title="Providers"
      subtitle="Persisted in the database and used by runtime selection. skillproof.local.json is only a local fallback/override when DB rows are unavailable."
      navLinks={ADMIN_NAV}
      activeHref="/admin/providers"
    >
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone={apiKeyPresent ? "good" : "warn"}>
          ANTHROPIC_API_KEY: {apiKeyPresent ? "present" : "missing"}
        </Badge>
        <a href="/admin/providers/health" className="rounded-md border border-border bg-panel2 px-2 py-1 text-xs text-ink hover:border-accent/60 hover:text-accent">
          Real provider readiness
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provider registry ({rows.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {rows.length === 0 ? (
            <ScaffoldNotice detail="Registry is empty. Run `npm run db:seed-registry` to populate." />
          ) : (
            <ProviderTable rows={rows} />
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}

function parseJson(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
