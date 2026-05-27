import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLES } from "@/lib/auth/roles";
import { ADMIN_NAV } from "../_nav";

export const dynamic = "force-dynamic";

type Search = { role?: string; q?: string };

export default async function AdminUsersPage({ searchParams }: { searchParams: Search }) {
  await requireAdminPage("/admin/users");

  const roleFilter = (ROLES as readonly string[]).includes(searchParams?.role ?? "")
    ? searchParams.role!
    : "all";
  const q = (searchParams?.q ?? "").trim();

  const where: any = {};
  if (roleFilter !== "all") where.role = roleFilter;
  if (q) {
    where.OR = [
      { email: { contains: q } },
      { name: { contains: q } },
      { githubUsername: { contains: q } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      primaryTenant: true,
      memberships: { include: { tenant: true } },
      _count: { select: { runsCreated: true, profilesOwned: true } },
    },
  });

  const totals = await prisma.user.groupBy({ by: ["role"], _count: { _all: true } });
  const totalByRole = Object.fromEntries(totals.map((t) => [t.role, t._count._all]));

  return (
    <RoleShell
      title="Users"
      subtitle="Every user on the platform. Filter by role or search by email/name."
      navLinks={ADMIN_NAV}
      activeHref="/admin/users"
    >
      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Role</label>
              <select
                name="role"
                defaultValue={roleFilter}
                className="mt-1 h-9 rounded-md border border-border bg-bg/65 px-2 text-sm text-ink"
              >
                <option value="all">all</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                    {totalByRole[r] ? ` (${totalByRole[r]})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grow">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Search</label>
              <input
                name="q"
                defaultValue={q}
                placeholder="email / name / github username"
                className="mt-1 h-9 w-full rounded-md border border-border bg-bg/65 px-3 text-sm text-ink placeholder:text-muted"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-md border border-accent/70 bg-accent px-3 text-xs font-semibold text-cream shadow-glow"
            >
              Apply
            </button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          {users.length === 0 ? (
            <ScaffoldNotice detail="No users match the filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Tenant</th>
                    <th className="py-2 pr-3">Runs</th>
                    <th className="py-2 pr-3">Profiles</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-panel2/40">
                      <td className="py-2 pr-3 font-mono text-xs">{u.email}</td>
                      <td className="py-2 pr-3 text-xs">{u.name}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={u.role === "admin" || u.role === "super_admin" ? "accent" : "default"}>
                          {u.role}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {u.primaryTenant?.name ?? <span className="text-muted">—</span>}
                        {u.memberships.length > 1 && (
                          <span className="ml-1 text-muted">(+{u.memberships.length - 1})</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{u._count.runsCreated}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{u._count.profilesOwned}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={u.status === "active" ? "good" : "warn"}>{u.status}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/admin/users/${u.id}`}
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
