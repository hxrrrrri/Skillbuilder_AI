import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { tenantRunWhere } from "@/lib/college/tenant";
import { getCollegePageContext } from "../../_auth";
import { COLLEGE_NAV } from "../../_nav";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImprovementPlanCard } from "@/components/improvement-plan";

export const dynamic = "force-dynamic";

export default async function CollegeStudentDetailPage({ params }: { params: { id: string } }) {
  const { scope, noTenant } = await getCollegePageContext(`/college/students/${params.id}`);
  if (noTenant || !scope) {
    return (
      <RoleShell title="Student detail" subtitle="Tenant-scoped student verification." navLinks={COLLEGE_NAV} activeHref="/college/students">
        <ScaffoldNotice title="No tenant" detail="Your account is not associated with a college tenant." />
      </RoleShell>
    );
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: params.id },
    include: {
      cohortMemberships: { include: { cohort: true } },
      profiles: {
        where: { visibility: { in: ["public", "unlisted"] } },
        include: { run: { select: { tenantId: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!candidate) notFound();

  const runs = await prisma.analysisRun.findMany({
    where: tenantRunWhere(scope, { candidateId: candidate.id }),
    include: { repository: true, scores: true },
    orderBy: { createdAt: "desc" },
  });
  if (runs.length === 0) notFound();

  const latest = runs[0];
  const best = runs.reduce((acc, r) => ((r.overallScore ?? -1) > (acc.overallScore ?? -1) ? r : acc), latest);
  const latestPlan = safeJsonParse<any>(latest.improvementPlan, null);
  const latestOwnership = safeJsonParse<any>(latest.ownershipStatus, null);
  const latestTerminal = safeJsonParse<any[]>(latest.terminalEvidence, []);
  const publicProfiles = candidate.profiles.filter((p) => scope.tenantIds.includes(p.run.tenantId ?? ""));
  const allScores = runs.flatMap((r) => r.scores.filter((s) => s.score >= 0));
  const strongest = allScores.sort((a, b) => b.score - a.score)[0] ?? null;
  const weakest = [...allScores].sort((a, b) => a.score - b.score)[0] ?? null;

  return (
    <RoleShell
      title={candidate.name}
      subtitle="Tenant-scoped student profile, runs, skill trajectory, and improvement plan."
      navLinks={COLLEGE_NAV}
      activeHref="/college/students"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={(best.overallScore ?? 0) >= 70 ? "good" : (best.overallScore ?? 0) >= 50 ? "warn" : "default"}>
          best score {best.overallScore ?? "not measured"}
        </Badge>
        <Badge>{runs.length} run{runs.length === 1 ? "" : "s"}</Badge>
        <Badge tone={latestOwnership?.confidence === "verified" ? "good" : "warn"}>
          ownership: {latestOwnership?.confidence ?? "not measured"}
        </Badge>
        {latestTerminal.some((t) => t.exitCode === 0) ? <Badge tone="good">terminal proof</Badge> : <Badge>terminal not measured</Badge>}
        {latest.verificationLevel === "repo_interview_verified" && <Badge tone="good">interview verified</Badge>}
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Latest score" value={latest.overallScore == null ? "not measured" : `${latest.overallScore}/100`} />
        <Metric label="Strongest skill" value={strongest ? `${strongest.skillName} ${strongest.score}` : "not measured"} />
        <Metric label="Weakest skill" value={weakest ? `${weakest.skillName} ${weakest.score}` : "not measured"} />
        <Metric label="Last verified" value={latest.completedAt ? new Date(latest.completedAt).toLocaleDateString() : "pending"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Verification runs</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="divide-y divide-border">
                {runs.map((run) => {
                  const ownership = safeJsonParse<any>(run.ownershipStatus, null);
                  const terminal = safeJsonParse<any[]>(run.terminalEvidence, []);
                  return (
                    <li key={run.id} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-mono text-sm text-ink">
                            {run.repository.owner}/{run.repository.repoName}
                          </div>
                          <div className="mt-0.5 text-xs text-muted">
                            {run.targetRole} · {new Date(run.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge tone={run.status === "completed" ? "good" : run.status === "failed" ? "bad" : "warn"}>
                            {run.status}
                          </Badge>
                          {run.overallScore != null && <Badge tone="accent">{run.overallScore}/100</Badge>}
                          <Badge tone={ownership?.confidence === "verified" ? "good" : "warn"}>
                            ownership {ownership?.confidence ?? "not measured"}
                          </Badge>
                          {terminal.some((t) => t.exitCode === 0) && <Badge tone="good">terminal</Badge>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Skill trajectory</CardTitle>
            </CardHeader>
            <CardBody>
              <ol className="space-y-2 text-sm">
                {[...runs].reverse().map((run) => (
                  <li key={run.id} className="flex items-center justify-between rounded border border-border bg-panel2/40 px-3 py-2">
                    <span className="font-mono text-xs text-muted">{new Date(run.createdAt).toLocaleDateString()}</span>
                    <span className="text-ink">{run.repository.repoName}</span>
                    <Badge tone={(run.overallScore ?? 0) >= 70 ? "good" : (run.overallScore ?? 0) >= 50 ? "warn" : "default"}>
                      {run.overallScore ?? "not measured"}
                    </Badge>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          {latestPlan && (
            <Card>
              <CardHeader>
                <CardTitle>Improvement plan</CardTitle>
              </CardHeader>
              <CardBody>
                <ImprovementPlanCard data={latestPlan} />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cohorts</CardTitle>
            </CardHeader>
            <CardBody>
              {candidate.cohortMemberships.length === 0 ? (
                <ScaffoldNotice detail="This student is not assigned to a cohort yet." />
              ) : (
                <ul className="space-y-2 text-sm">
                  {candidate.cohortMemberships
                    .filter((m) => m.cohort.tenantId === scope.tenantId)
                    .map((m) => (
                      <li key={m.id}>
                        <Link href={`/college/cohorts/${m.cohortId}`} className="text-accent hover:underline">
                          {m.cohort.name}
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profiles</CardTitle>
            </CardHeader>
            <CardBody>
              {publicProfiles.length === 0 ? (
                <ScaffoldNotice detail="No shared public or unlisted profiles are available for this student." />
              ) : (
                <ul className="space-y-2 text-sm">
                  {publicProfiles.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <Link href={`/profile/${p.slug}`} className="font-mono text-accent hover:underline">
                        /{p.slug}
                      </Link>
                      <Badge>{p.visibility}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </RoleShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
        <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
      </CardBody>
    </Card>
  );
}
