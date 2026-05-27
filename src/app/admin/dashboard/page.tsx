import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV } from "../_nav";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const user = await requireAdminPage("/admin/dashboard");

  const [userCount, tenantCount, runCount, completedCount, failedCount, runningCount, profileCount, auditCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.tenant.count(),
      prisma.analysisRun.count(),
      prisma.analysisRun.count({ where: { status: "completed" } }),
      prisma.analysisRun.count({ where: { status: "failed" } }),
      prisma.analysisRun.count({ where: { status: { in: ["running", "pending"] } } }),
      prisma.publicProfile.count(),
      prisma.auditLog.count(),
    ]);

  const recentRuns = await prisma.analysisRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { repository: true, candidate: true, createdBy: true },
  });

  const recentAudit = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { actor: true, tenant: true },
  });

  return (
    <RoleShell
      title="Platform control plane"
      subtitle={`Signed in as ${user.email} · role: ${user.role}`}
      navLinks={ADMIN_NAV}
      activeHref="/admin/dashboard"
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Users" value={userCount} />
        <StatCard label="Tenants" value={tenantCount} />
        <StatCard label="Runs total" value={runCount} />
        <StatCard label="Public profiles" value={profileCount} />
        <StatCard label="Running / pending" value={runningCount} tone="warn" />
        <StatCard label="Completed" value={completedCount} tone="good" />
        <StatCard label="Failed" value={failedCount} tone="bad" />
        <StatCard label="Audit entries" value={auditCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardBody>
          {recentRuns.length === 0 ? (
            <ScaffoldNotice detail="No runs yet. Trigger one from a candidate account." />
          ) : (
            <ul className="divide-y divide-border">
              {recentRuns.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link href={`/mission/${r.id}`} className="font-mono text-ink hover:text-accent">
                      {r.repository.owner}/{r.repository.repoName}
                    </Link>
                    <div className="text-xs text-muted">
                      {r.candidate?.name ?? r.createdBy?.email ?? "anon"} · {r.targetRole} ·{" "}
                      {new Date(r.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <Badge tone={r.status === "completed" ? "good" : r.status === "failed" ? "bad" : "warn"}>
                    {r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent audit log</CardTitle>
        </CardHeader>
        <CardBody>
          {recentAudit.length === 0 ? (
            <ScaffoldNotice detail="No audit entries yet. They will appear here as users register, publish, or call sensitive APIs." />
          ) : (
            <ul className="divide-y divide-border">
              {recentAudit.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <code className="rounded bg-panel2 px-1.5 py-0.5 text-xs">{a.action}</code>
                    <span className="ml-2 text-xs text-muted">
                      {a.actor?.email ?? "system"} {a.tenant ? `· ${a.tenant.name}` : ""}
                    </span>
                  </div>
                  <span className="text-xs text-muted">{new Date(a.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  return (
    <Card>
      <CardBody>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p
          className={`mt-2 font-display text-3xl ${
            tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink"
          }`}
        >
          {value}
        </p>
      </CardBody>
    </Card>
  );
}
