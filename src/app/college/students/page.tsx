import Link from "next/link";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COLLEGE_NAV } from "../_nav";
import { getCollegePageContext } from "../_auth";
import { tenantRunWhere } from "@/lib/college/tenant";

export const dynamic = "force-dynamic";

export default async function CollegeStudentsPage() {
  const { scope, noTenant } = await getCollegePageContext("/college/students");

  if (noTenant || !scope) {
    return (
      <RoleShell title="Students" subtitle="Tenant-scoped student roster." navLinks={COLLEGE_NAV} activeHref="/college/students">
        <ScaffoldNotice title="No tenant" detail="Your account is not yet associated with a college tenant." />
      </RoleShell>
    );
  }

  const runs = await prisma.analysisRun.findMany({
    where: tenantRunWhere(scope),
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
    <RoleShell title="Students" subtitle="Tenant-scoped student roster." navLinks={COLLEGE_NAV} activeHref="/college/students">
      {byCandidate.size === 0 ? (
        <ScaffoldNotice detail="No students with runs yet. Invite candidates into a cohort, then their verification runs appear here." />
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
                      <Link href={`/college/students/${top.candidateId ?? key}`} className="text-sm text-ink hover:text-accent">
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
