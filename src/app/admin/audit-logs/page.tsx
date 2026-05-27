import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody } from "@/components/ui/card";
import { ADMIN_NAV } from "../_nav";

export const dynamic = "force-dynamic";

type Search = { action?: string; actor?: string };

export default async function AdminAuditLogsPage({ searchParams }: { searchParams: Search }) {
  await requireAdminPage("/admin/audit-logs");

  const action = (searchParams?.action ?? "").trim();
  const actor = (searchParams?.actor ?? "").trim();

  const where: any = {};
  if (action) where.action = { contains: action };
  if (actor) where.actor = { email: { contains: actor } };

  const [entries, knownActions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 250,
      include: { actor: true, tenant: true },
    }),
    prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true } }),
  ]);

  const sortedActions = knownActions.sort((a, b) => b._count._all - a._count._all);

  return (
    <RoleShell
      title="Audit log"
      subtitle="Every sensitive action recorded by the platform. Tokens/passwords are redacted before storage."
      navLinks={ADMIN_NAV}
      activeHref="/admin/audit-logs"
    >
      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="grow">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Action contains</label>
              <input
                name="action"
                defaultValue={action}
                placeholder="run.started, profile.publish, …"
                className="mt-1 h-9 w-full rounded-md border border-border bg-bg/65 px-3 text-sm text-ink"
              />
            </div>
            <div className="grow">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Actor email contains</label>
              <input
                name="actor"
                defaultValue={actor}
                placeholder="candidate@skillproof.dev"
                className="mt-1 h-9 w-full rounded-md border border-border bg-bg/65 px-3 text-sm text-ink"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-md border border-accent/70 bg-accent px-3 text-xs font-semibold text-cream shadow-glow"
            >
              Apply
            </button>
          </form>
          {sortedActions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {sortedActions.slice(0, 12).map((a) => (
                <Link
                  key={a.action}
                  href={`/admin/audit-logs?action=${encodeURIComponent(a.action)}`}
                  className="rounded-md border border-border bg-panel2 px-2 py-0.5 text-muted hover:border-accent/60 hover:text-accent"
                >
                  {a.action} <span className="text-muted/70">({a._count._all})</span>
                </Link>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          {entries.length === 0 ? (
            <ScaffoldNotice detail="No audit entries match the filter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Actor</th>
                    <th className="py-2 pr-3">Tenant</th>
                    <th className="py-2 pr-3">Target</th>
                    <th className="py-2 pr-3">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 pr-3 text-xs text-muted">{new Date(a.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-3">
                        <code className="rounded bg-panel2 px-1.5 py-0.5 text-xs">{a.action}</code>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {a.actor ? (
                          <Link href={`/admin/users/${a.actor.id}`} className="text-ink hover:text-accent">
                            {a.actor.email}
                          </Link>
                        ) : (
                          <span className="text-muted">system</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {a.tenant ? (
                          <Link href={`/admin/tenants/${a.tenant.id}`} className="text-ink hover:text-accent">
                            {a.tenant.name}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs font-mono text-muted">
                        {a.targetType && a.targetId ? `${a.targetType}:${a.targetId.slice(-8)}` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs font-mono text-muted">
                        {a.metadata ? (
                          <details>
                            <summary className="cursor-pointer">view</summary>
                            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[11px]">
                              {a.metadata}
                            </pre>
                          </details>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}
