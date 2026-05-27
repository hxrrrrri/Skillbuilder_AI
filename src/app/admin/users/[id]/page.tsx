import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV } from "../../_nav";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  await requireAdminPage(`/admin/users/${params.id}`);

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      primaryTenant: true,
      memberships: { include: { tenant: true } },
      candidate: true,
      runsCreated: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { repository: true },
      },
      profilesOwned: { orderBy: { createdAt: "desc" }, take: 20, include: { run: { include: { repository: true } } } },
    },
  });
  if (!user) notFound();

  const audit = await prisma.auditLog.findMany({
    where: { actorUserId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <RoleShell
      title={user.name}
      subtitle={`${user.email} · ${user.role}`}
      navLinks={ADMIN_NAV}
      activeHref="/admin/users"
    >
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2">
            <KV k="User ID" v={user.id} />
            <KV k="Email" v={user.email} />
            <KV k="Role" v={<Badge tone="accent">{user.role}</Badge>} />
            <KV k="Status" v={<Badge tone={user.status === "active" ? "good" : "warn"}>{user.status}</Badge>} />
            <KV k="Primary tenant" v={user.primaryTenant ? `${user.primaryTenant.name} (${user.primaryTenant.kind})` : "—"} />
            <KV k="GitHub username" v={user.githubUsername ?? "—"} />
            <KV k="Created" v={new Date(user.createdAt).toLocaleString()} />
            <KV k="Updated" v={new Date(user.updatedAt).toLocaleString()} />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tenant memberships ({user.memberships.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {user.memberships.length === 0 ? (
            <ScaffoldNotice detail="This user has no tenant memberships." />
          ) : (
            <ul className="divide-y divide-border">
              {user.memberships.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/admin/tenants/${m.tenant.id}`} className="text-ink hover:text-accent">
                    {m.tenant.name}
                  </Link>
                  <span className="text-xs text-muted">
                    {m.tenant.kind} · {m.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runs created ({user.runsCreated.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {user.runsCreated.length === 0 ? (
            <ScaffoldNotice detail="This user has not started any runs." />
          ) : (
            <ul className="divide-y divide-border">
              {user.runsCreated.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/admin/runs/${r.id}`} className="font-mono text-xs text-ink hover:text-accent">
                    {r.repository.owner}/{r.repository.repoName}
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge tone={r.status === "completed" ? "good" : r.status === "failed" ? "bad" : "warn"}>
                      {r.status}
                    </Badge>
                    {r.overallScore != null && <span className="font-mono text-xs">{r.overallScore}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profiles owned ({user.profilesOwned.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {user.profilesOwned.length === 0 ? (
            <ScaffoldNotice detail="No public profiles owned." />
          ) : (
            <ul className="divide-y divide-border">
              {user.profilesOwned.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/profile/${p.slug}`} className="font-mono text-accent hover:underline">
                    /{p.slug}
                  </Link>
                  <span className="text-xs text-muted">{p.visibility}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity ({audit.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {audit.length === 0 ? (
            <ScaffoldNotice detail="No audit entries." />
          ) : (
            <ul className="divide-y divide-border">
              {audit.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <code className="rounded bg-panel2 px-1.5 py-0.5 text-xs">{a.action}</code>
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

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{k}</dt>
      <dd className="text-sm text-ink">{v}</dd>
    </div>
  );
}
