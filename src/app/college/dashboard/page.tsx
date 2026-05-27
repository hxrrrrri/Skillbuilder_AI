import Link from "next/link";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COLLEGE_NAV } from "../_nav";
import { getCollegePageContext } from "../_auth";
import { getPlacementReady, getSkillGaps, tenantRunWhere } from "@/lib/college/tenant";

export const dynamic = "force-dynamic";

export default async function CollegeDashboard() {
  const { scope, noTenant } = await getCollegePageContext("/college/dashboard");

  if (noTenant || !scope) {
    return (
      <RoleShell
        title="College workspace"
        subtitle="Track student verification, skill gaps, and placement readiness."
        navLinks={COLLEGE_NAV}
        activeHref="/college/dashboard"
      >
        <ScaffoldNotice
          title="No tenant"
          detail="Your account is not yet associated with a college tenant. Ask your platform admin to add you, or register a new college from /register."
        />
      </RoleShell>
    );
  }

  const runs = await prisma.analysisRun.findMany({
    where: tenantRunWhere(scope),
    include: { candidate: true, repository: true },
    orderBy: { createdAt: "desc" },
  });
  const cohorts = await prisma.cohort.count({ where: { tenantId: scope.tenantId } });

  const completed = runs.filter((r) => r.status === "completed");
  const avgScore = completed.length
    ? Math.round(
        completed.reduce((acc, r) => acc + (r.overallScore ?? 0), 0) / completed.length,
      )
    : 0;
  const verified = completed.filter((r) => r.verificationLevel === "repo_interview_verified").length;
  const skillGaps = await getSkillGaps(scope);
  const placement = await getPlacementReady(scope);
  const ready = placement.filter((r) => r.ready).length;

  return (
    <RoleShell
      title="College workspace"
      subtitle="Track student verification, skill gaps, and placement readiness."
      navLinks={COLLEGE_NAV}
      activeHref="/college/dashboard"
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Students with runs</p>
            <p className="mt-2 font-display text-4xl text-ink">{new Set(runs.map((r) => r.candidateId).filter(Boolean)).size}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Completed runs</p>
            <p className="mt-2 font-display text-4xl text-ink">{completed.length}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Avg score</p>
            <p className="mt-2 font-display text-4xl text-ink">{avgScore || "—"}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cohorts</p>
            <p className="mt-2 font-display text-4xl text-ink">{cohorts}</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Placement readiness</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="font-display text-4xl text-ink">{ready}</p>
            <p className="mt-1 text-sm text-muted">
              {placement.length} tenant-scoped completed run{placement.length === 1 ? "" : "s"} evaluated against the default placement threshold.
            </p>
            <div className="mt-3 flex gap-2">
              <Badge tone={verified > 0 ? "good" : "default"}>{verified} interview verified</Badge>
              <Badge tone={ready > 0 ? "good" : "warn"}>{ready} ready</Badge>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Largest skill gaps</CardTitle>
          </CardHeader>
          <CardBody>
            {skillGaps.total_runs === 0 ? (
              <ScaffoldNotice detail="Skill-gap analytics appear after students complete tenant-scoped verification runs." />
            ) : (
              <ul className="space-y-2 text-sm">
                {skillGaps.gaps.slice(0, 4).map((g) => (
                  <li key={g.skill} className="flex items-center justify-between">
                    <span className="text-ink">{g.skill}</span>
                    <span className="font-mono text-muted">{g.weak_count}/{g.total_runs}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardBody>
          {runs.length === 0 ? (
            <ScaffoldNotice detail="No tenant-scoped runs yet. Create a cohort, invite students, then their verification runs will populate this activity feed." />
          ) : (
            <ul className="divide-y divide-border">
              {runs.slice(0, 12).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link href={r.candidateId ? `/college/students/${r.candidateId}` : "/college/students"} className="text-sm text-ink hover:text-accent">
                      {r.candidate?.name ?? "Unknown candidate"}
                    </Link>
                    <div className="mt-0.5 font-mono text-xs text-muted">
                      {r.repository.owner}/{r.repository.repoName} · {r.targetRole}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={r.status === "completed" ? "good" : r.status === "failed" ? "bad" : "warn"}>
                      {r.status}
                    </Badge>
                    {r.overallScore != null && (
                      <span className="font-mono text-sm text-ink">{r.overallScore}</span>
                    )}
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
