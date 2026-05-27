import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV } from "../../_nav";

export const dynamic = "force-dynamic";

export default async function AdminTenantDetailPage({ params }: { params: { id: string } }) {
  await requireAdminPage(`/admin/tenants/${params.id}`);

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      memberships: { include: { user: true } },
      runs: {
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { repository: true, candidate: true },
      },
    },
  });
  if (!tenant) notFound();

  return (
    <RoleShell
      title={tenant.name}
      subtitle={`${tenant.kind} · ${tenant.slug}`}
      navLinks={ADMIN_NAV}
      activeHref="/admin/tenants"
    >
      <Card>
        <CardHeader>
          <CardTitle>Tenant</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2">
            <KV k="ID" v={tenant.id} />
            <KV k="Slug" v={tenant.slug} />
            <KV k="Kind" v={tenant.kind} />
            <KV k="Status" v={tenant.status} />
            <KV k="Created" v={new Date(tenant.createdAt).toLocaleString()} />
            <KV k="Updated" v={new Date(tenant.updatedAt).toLocaleString()} />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members ({tenant.memberships.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {tenant.memberships.length === 0 ? (
            <ScaffoldNotice detail="No members yet." />
          ) : (
            <ul className="divide-y divide-border">
              {tenant.memberships.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/admin/users/${m.user.id}`} className="text-ink hover:text-accent">
                    {m.user.email}
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge tone="default">{m.user.role}</Badge>
                    <Badge tone="accent">{m.role}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs ({tenant.runs.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {tenant.runs.length === 0 ? (
            <ScaffoldNotice detail="No tenant-scoped runs yet." />
          ) : (
            <ul className="divide-y divide-border">
              {tenant.runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/admin/runs/${r.id}`} className="font-mono text-xs text-ink hover:text-accent">
                    {r.repository.owner}/{r.repository.repoName}
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{r.candidate?.name ?? "anon"}</span>
                    <Badge tone={r.status === "completed" ? "good" : r.status === "failed" ? "bad" : "warn"}>
                      {r.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{k}</dt>
      <dd className="text-sm text-ink">{v}</dd>
    </div>
  );
}
