import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV } from "../_nav";

export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
  await requireAdminPage("/admin/tenants");

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { memberships: true, runs: true } },
    },
  });

  return (
    <RoleShell
      title="Tenants"
      subtitle="Colleges, employers, and platform tenants."
      navLinks={ADMIN_NAV}
      activeHref="/admin/tenants"
    >
      <Card>
        <CardBody>
          {tenants.length === 0 ? (
            <ScaffoldNotice detail="No tenants yet. Users registering as employer / college_admin auto-create one." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Slug</th>
                    <th className="py-2 pr-3">Kind</th>
                    <th className="py-2 pr-3">Members</th>
                    <th className="py-2 pr-3">Runs</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tenants.map((t) => (
                    <tr key={t.id} className="hover:bg-panel2/40">
                      <td className="py-2 pr-3 text-sm text-ink">{t.name}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-muted">{t.slug}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={t.kind === "college" ? "accent" : "default"}>{t.kind}</Badge>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{t._count.memberships}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{t._count.runs}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={t.status === "active" ? "good" : "warn"}>{t.status}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted">{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/admin/tenants/${t.id}`}
                          className="rounded-md border border-border bg-panel2 px-2 py-1 text-xs text-ink hover:border-accent/60 hover:text-accent"
                        >
                          Detail →
                        </Link>
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
