import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV } from "../_nav";

export const dynamic = "force-dynamic";

const STATUSES = ["all", "pending", "running", "completed", "failed"] as const;
const MODES = ["all", "api", "cli", "hybrid", "local"] as const;

type Search = { status?: string; mode?: string; q?: string };

function pickStatus(v: string | undefined) {
  return (STATUSES as readonly string[]).includes(v ?? "") ? (v as string) : "all";
}
function pickMode(v: string | undefined) {
  return (MODES as readonly string[]).includes(v ?? "") ? (v as string) : "all";
}

export default async function AdminRunsPage({ searchParams }: { searchParams: Search }) {
  await requireAdminPage("/admin/runs");

  const status = pickStatus(searchParams?.status);
  const mode = pickMode(searchParams?.mode);
  const q = (searchParams?.q ?? "").trim();

  const where: any = {};
  if (status !== "all") where.status = status;
  if (mode !== "all") where.executionMode = mode;
  if (q) {
    where.OR = [
      { repository: { repoName: { contains: q } } },
      { repository: { owner: { contains: q } } },
      { targetRole: { contains: q } },
      { candidate: { name: { contains: q } } },
    ];
  }

  const runs = await prisma.analysisRun.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { repository: true, candidate: true, createdBy: true, tenant: true },
  });

  const counts = await prisma.analysisRun.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  return (
    <RoleShell
      title="Runs"
      subtitle="Every analysis run across the platform. Filter, search, and drill into the agent trace."
      navLinks={ADMIN_NAV}
      activeHref="/admin/runs"
    >
      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Status</label>
              <select
                name="status"
                defaultValue={status}
                className="mt-1 h-9 rounded-md border border-border bg-bg/65 px-2 text-sm text-ink"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                    {s !== "all" && byStatus[s] ? ` (${byStatus[s]})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Mode</label>
              <select
                name="mode"
                defaultValue={mode}
                className="mt-1 h-9 rounded-md border border-border bg-bg/65 px-2 text-sm text-ink"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="grow">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Search</label>
              <input
                name="q"
                defaultValue={q}
                placeholder="repo / owner / role / candidate"
                className="mt-1 h-9 w-full rounded-md border border-border bg-bg/65 px-3 text-sm text-ink placeholder:text-muted"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-md border border-accent/70 bg-accent px-3 text-xs font-semibold text-cream shadow-glow hover:bg-[#ba654f]"
            >
              Apply
            </button>
            <Link
              href="/admin/runs"
              className="h-9 inline-flex items-center rounded-md border border-border bg-panel2 px-3 text-xs text-muted hover:text-ink"
            >
              Reset
            </Link>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          {runs.length === 0 ? (
            <ScaffoldNotice detail="No runs match these filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Repo</th>
                    <th className="py-2 pr-3">Candidate</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Mode</th>
                    <th className="py-2 pr-3">Tenant</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runs.map((r) => (
                    <tr key={r.id} className="hover:bg-panel2/40">
                      <td className="py-2 pr-3 font-mono text-xs">
                        {r.repository.owner}/{r.repository.repoName}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {r.candidate?.name ?? r.createdBy?.email ?? <span className="text-muted">anon</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs">{r.targetRole}</td>
                      <td className="py-2 pr-3 text-xs">{r.executionMode}</td>
                      <td className="py-2 pr-3 text-xs">{r.tenant?.name ?? <span className="text-muted">—</span>}</td>
                      <td className="py-2 pr-3">
                        <Badge
                          tone={
                            r.status === "completed" ? "good" : r.status === "failed" ? "bad" : "warn"
                          }
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.overallScore ?? "—"}</td>
                      <td className="py-2 pr-3 text-xs text-muted">
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/admin/runs/${r.id}`}
                          className="rounded-md border border-border bg-panel2 px-2 py-1 text-xs text-ink hover:border-accent/60 hover:text-accent"
                        >
                          Trace →
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
