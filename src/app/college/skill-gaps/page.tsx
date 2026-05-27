import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COLLEGE_NAV } from "../_nav";
import { getCollegePageContext } from "../_auth";
import { getSkillGaps } from "@/lib/college/tenant";
import { SkillGapChart } from "./skill-gap-chart";

export const dynamic = "force-dynamic";

export default async function CollegeSkillGapsPage({ searchParams }: { searchParams: { cohort?: string } }) {
  const { scope, noTenant } = await getCollegePageContext("/college/skill-gaps");
  if (noTenant || !scope) {
    return (
      <RoleShell title="Skill gaps" subtitle="Weak-skill aggregation across tenant runs." navLinks={COLLEGE_NAV} activeHref="/college/skill-gaps">
        <ScaffoldNotice title="No tenant" detail="Your account is not associated with a college tenant yet." />
      </RoleShell>
    );
  }

  const cohorts = await prisma.cohort.findMany({ where: { tenantId: scope.tenantId }, orderBy: { createdAt: "desc" } });
  const selected = searchParams.cohort && cohorts.some((c) => c.id === searchParams.cohort) ? searchParams.cohort : null;
  const data = await getSkillGaps(scope, selected);

  return (
    <RoleShell title="Skill gaps" subtitle="Weak-skill aggregation across tenant runs." navLinks={COLLEGE_NAV} activeHref="/college/skill-gaps">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Weak skills below 60</CardTitle>
            <Badge tone="accent">{data.total_runs} runs</Badge>
          </div>
        </CardHeader>
        <CardBody>
          {cohorts.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <a href="/college/skill-gaps" className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-ink">All cohorts</a>
              {cohorts.map((cohort) => (
                <a
                  key={cohort.id}
                  href={`/college/skill-gaps?cohort=${cohort.id}`}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-ink"
                >
                  {cohort.name}
                </a>
              ))}
            </div>
          )}
          {data.total_runs === 0 ? (
            <ScaffoldNotice detail="Skill gaps are computed only from completed tenant-scoped verification runs." />
          ) : (
            <SkillGapChart rows={data.gaps} />
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}
