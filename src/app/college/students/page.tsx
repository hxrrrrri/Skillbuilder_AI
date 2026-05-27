import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/college/dashboard", label: "Dashboard" },
  { href: "/college/students", label: "Students" },
  { href: "/college/cohorts", label: "Cohorts", badge: "soon" },
];

export default async function CollegeStudentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/college/students");

  if (user.tenantIds.length === 0 && !["admin", "super_admin"].includes(user.role)) {
    return (
      <RoleShell title="Students" subtitle="Tenant-scoped student roster." navLinks={NAV} activeHref="/college/students">
        <ScaffoldNotice title="No tenant" detail="Your account is not yet associated with a college tenant." />
      </RoleShell>
    );
  }

  const tenantIds = user.tenantIds.length > 0 ? user.tenantIds : undefined;
  const runs = await prisma.analysisRun.findMany({
    where: tenantIds ? { tenantId: { in: tenantIds } } : {},
    include: { candidate: true, repository: true },
    orderBy: { createdAt: "desc" },
  });

  const byCandidate = new Map<string, typeof runs>();
  for (const r of runs) {
    const key = r.candidateId ?? r.id;
    if (!byCandidate.has(key)) byCandidate.set(key, []);
    byCandidate.get(key)!.push(r);
  }

  return (
    <RoleShell title="Students" subtitle="Tenant-scoped student roster." navLinks={NAV} activeHref="/college/students">
      {byCandidate.size === 0 ? (
        <ScaffoldNotice detail="No students with runs yet. Invite flow lands in the next slice." />
      ) : (
        <Card>
          <CardBody>
            <ul className="divide-y divide-border">
              {Array.from(byCandidate.entries()).map(([key, list]) => {
                const top = list[0];
                const bestScore = Math.max(...list.map((r) => r.overallScore ?? 0));
                return (
                  <li key={key} className="flex items-center justify-between py-3">
                    <div>
                      <Link href={`/mission/${top.id}`} className="text-sm text-ink hover:text-accent">
                        {top.candidate?.name ?? "Unknown student"}
                      </Link>
                      <div className="mt-0.5 font-mono text-xs text-muted">
                        {list.length} run{list.length === 1 ? "" : "s"} · best score {bestScore || "—"}
                      </div>
                    </div>
                    <Badge tone={bestScore >= 70 ? "good" : bestScore >= 50 ? "warn" : "default"}>
                      {bestScore >= 70 ? "placement ready" : bestScore >= 50 ? "developing" : "early"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}
    </RoleShell>
  );
}
