import Link from "next/link";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COLLEGE_NAV } from "../_nav";
import { getCollegePageContext } from "../_auth";
import { CohortCreateForm } from "./cohort-create-form";

export const dynamic = "force-dynamic";

export default async function CollegeCohortsPage() {
  const { scope, noTenant } = await getCollegePageContext("/college/cohorts");
  if (noTenant || !scope) {
    return (
      <RoleShell title="Cohorts" subtitle="Group students into tenant-scoped cohorts." navLinks={COLLEGE_NAV} activeHref="/college/cohorts">
        <ScaffoldNotice title="No tenant" detail="Your account is not associated with a college tenant yet." />
      </RoleShell>
    );
  }

  const cohorts = await prisma.cohort.findMany({
    where: { tenantId: scope.tenantId },
    include: { _count: { select: { students: true, invites: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <RoleShell title="Cohorts" subtitle="Group students into tenant-scoped cohorts." navLinks={COLLEGE_NAV} activeHref="/college/cohorts">
      <Card>
        <CardHeader>
          <CardTitle>Create cohort</CardTitle>
        </CardHeader>
        <CardBody>
          <CohortCreateForm />
        </CardBody>
      </Card>

      {cohorts.length === 0 ? (
        <ScaffoldNotice detail="No cohorts yet. Create one above, then invite students into it." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cohorts.map((cohort) => (
            <Card key={cohort.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>{cohort.name}</CardTitle>
                  {cohort.year && <Badge>{cohort.year}</Badge>}
                </div>
              </CardHeader>
              <CardBody>
                <p className="min-h-10 text-sm text-muted">{cohort.notes || "No notes recorded."}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone="accent">{cohort._count.students} students</Badge>
                  <Badge>{cohort._count.invites} invites</Badge>
                </div>
                <Link href={`/college/cohorts/${cohort.id}`} className="mt-4 inline-flex text-sm font-semibold text-accent hover:text-ink">
                  Open cohort
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </RoleShell>
  );
}
