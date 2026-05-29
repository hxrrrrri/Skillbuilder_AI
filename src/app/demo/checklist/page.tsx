import Link from "next/link";
import { prisma } from "@/lib/db";
import { buildDemoChecklist } from "@/lib/demo-checklist";
import { listProviderConfigs } from "@/lib/providers/registry";
import { listProviderHealth } from "@/lib/providers/provider-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const DEMO_EMAILS = [
  "candidate@skillproof.dev",
  "employer@skillproof.dev",
  "college@skillproof.dev",
  "admin@skillproof.dev",
];

async function safeCount<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; value: null }> {
  try {
    return { ok: true, value: await fn() };
  } catch {
    return { ok: false, value: null };
  }
}

export default async function DemoChecklistPage() {
  const [userCount, providerConfigs, promptCount, providerHealth] = await Promise.all([
    safeCount(() => prisma.user.count({ where: { email: { in: DEMO_EMAILS } } })),
    safeCount(() => listProviderConfigs()),
    safeCount(() => prisma.promptVersion.count({ where: { isActive: true } })),
    safeCount(() => listProviderHealth()),
  ]);

  const configRows = providerConfigs.ok ? providerConfigs.value : [];
  const configByProvider = new Map(configRows.map((row) => [row.providerId, row]));
  const healthRows = providerHealth.ok ? providerHealth.value : [];
  const checklist = buildDemoChecklist({
    databaseReady: userCount.ok,
    seededUsersReady: userCount.ok && userCount.value === DEMO_EMAILS.length,
    providerRegistryReady: configRows.length >= 6,
    promptVersionsReady: promptCount.ok && promptCount.value >= 14,
    providerHealth: healthRows.map((health) => {
      const config = configByProvider.get(health.providerId);
      const dbReady = health.providerId === "deterministic" || (config?.lastTestStatus === "ok" && config?.lastTestJsonOk === true);
      return {
        providerId: health.providerId,
        label: health.label,
        status: dbReady ? health.status : health.providerId === "deterministic" ? health.status : "failed",
        fix: dbReady ? health.fix : config?.lastTestError ?? "Run Admin -> Providers -> Health -> Run test.",
      };
    }),
    workerMode: process.env.SKILLPROOF_WORKER_MODE === "1" ? "worker" : "in_process",
    terminalEnabled: process.env.SKILLPROOF_TERMINAL_ENABLED === "1",
    publicReportsEnabled: process.env.SKILLPROOF_PUBLIC_REPORTS_ENABLED !== "0",
    githubTokenConfigured: !!process.env.GITHUB_TOKEN,
    githubRateLimit: null,
  });

  const blocked = checklist.filter((item) => item.status === "blocked").length;
  const warnings = checklist.filter((item) => item.status === "warn").length;

  return (
    <div className="space-y-8">
      <section className="border-b border-border pb-8">
        <div className="flex flex-wrap gap-2">
          <Badge tone={blocked ? "warn" : "good"}>{blocked ? `${blocked} blockers` : "ready"}</Badge>
          <Badge tone={warnings ? "warn" : "default"}>{warnings} warnings</Badge>
          <Badge>Certified demo setup</Badge>
        </div>
        <h1 className="mt-4 font-display text-4xl font-medium text-ink md:text-5xl">SkillProof AI Demo Checklist</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          This page reports real local setup state. If no real provider has passed a JSON contract health test, the app
          allows private UI walkthroughs only and keeps public scoring blocked.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {checklist.map((item) => (
          <Card key={item.id} className={item.status === "blocked" ? "border-warn/45" : item.status === "ready" ? "border-good/35" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{item.label}</CardTitle>
                <Badge tone={item.status === "ready" ? "good" : item.status === "blocked" ? "warn" : "default"}>{item.status}</Badge>
              </div>
            </CardHeader>
            <CardBody className="space-y-3 text-sm text-muted">
              <p>{item.detail}</p>
              <div className="rounded-md border border-border bg-bg/45 p-3 font-mono text-xs text-ink">{item.nextAction}</div>
            </CardBody>
          </Card>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/demo" className="rounded-md border border-border bg-panel px-4 py-2 text-sm font-semibold text-ink hover:border-accent/60">
          Back to demo
        </Link>
        <Link href="/admin/providers/health" className="rounded-md border border-accent/60 bg-accent px-4 py-2 text-sm font-semibold text-bg">
          Provider health
        </Link>
      </div>
    </div>
  );
}
