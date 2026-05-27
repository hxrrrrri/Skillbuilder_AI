import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COLLEGE_NAV } from "../../_nav";
import { getCollegePageContext } from "../../_auth";
import { AddStudentForm } from "./add-student-form";

export const dynamic = "force-dynamic";

export default async function CollegeCohortDetailPage({ params }: { params: { id: string } }) {
  const { scope, noTenant } = await getCollegePageContext(`/college/cohorts/${params.id}`);
  if (noTenant || !scope) {
    return (
      <RoleShell title="Cohort" subtitle="Tenant-scoped cohort detail." navLinks={COLLEGE_NAV} activeHref="/college/cohorts">
        <ScaffoldNotice title="No tenant" detail="Your account is not associated with a college tenant yet." />
      </RoleShell>
    );
  }

  const cohort = await prisma.cohort.findFirst({
    where: { id: params.id, tenantId: scope.tenantId },
    include: {
      students: {
        include: {
          candidate: {
            include: {
              runs: {
                where: { tenantId: { in: scope.tenantIds.length ? scope.tenantIds : [scope.tenantId] } },
                orderBy: { completedAt: "desc" },
                include: { repository: true },
              },
            },
          },
        },
        orderBy: { joinedAt: "desc" },
      },
      invites: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!cohort) notFound();

  return (
    <RoleShell title={cohort.name} subtitle="Cohort membership, invites, and student verification runs." navLinks={COLLEGE_NAV} activeHref="/college/cohorts">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Roster</CardTitle>
            <div className="flex gap-2">
              {cohort.year && <Badge>{cohort.year}</Badge>}
              <Badge tone="accent">{cohort.students.length} students</Badge>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <AddStudentForm cohortId={cohort.id} />
          {cohort.students.length === 0 ? (
            <div className="mt-4">
              <ScaffoldNotice detail="This cohort has no students yet. Add an existing candidate by email or create invite links from the invite page." />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {cohort.students.map((row) => {
                const latest = row.candidate.runs[0];
                const best = Math.max(0, ...row.candidate.runs.map((run) => run.overallScore ?? 0));
                return (
                  <li key={row.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{row.candidate.name}</p>
                        <p className="font-mono text-xs text-muted">{row.candidate.email ?? row.candidate.githubUsername ?? "no contact recorded"}</p>
                      </div>
                      <div className="flex gap-2">
                        <Badge tone={best >= 70 ? "good" : best >= 50 ? "warn" : "default"}>best {best || "not scored"}</Badge>
                        <Badge>{row.candidate.runs.length} runs</Badge>
                      </div>
                    </div>
                    {latest && (
                      <Link href={`/mission/${latest.id}`} className="mt-2 inline-flex font-mono text-xs text-accent hover:text-ink">
                        {latest.repository.owner}/{latest.repository.repoName} · {latest.status}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invites</CardTitle>
        </CardHeader>
        <CardBody>
          {cohort.invites.length === 0 ? (
            <ScaffoldNotice detail="No invite links have been generated for this cohort yet." />
          ) : (
            <ul className="divide-y divide-border">
              {cohort.invites.slice(0, 20).map((invite) => (
                <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm text-ink">{invite.email}</p>
                    <p className="font-mono text-xs text-muted">expires {invite.expiresAt.toLocaleDateString()}</p>
                  </div>
                  <Badge tone={invite.acceptedAt ? "good" : invite.expiresAt < new Date() ? "bad" : "warn"}>
                    {invite.acceptedAt ? "accepted" : invite.expiresAt < new Date() ? "expired" : "pending"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}
