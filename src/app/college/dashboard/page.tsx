import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/college/dashboard", label: "Dashboard" },
  { href: "/college/students", label: "Students" },
  { href: "/college/cohorts", label: "Cohorts", badge: "soon" },
];

export default async function CollegeDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/college/dashboard");

  if (user.tenantIds.length === 0 && !["admin", "super_admin"].includes(user.role)) {
    return (
      <RoleShell
        title="College workspace"
        subtitle="Track student verification, skill gaps, and placement readiness."
        navLinks={NAV}
        activeHref="/college/dashboard"
      >
        <ScaffoldNotice
          title="No tenant"
          detail="Your account is not yet associated with a college tenant. Ask your platform admin to add you, or register a new college from /register."
        />
      </RoleShell>
    );
  }

  const tenantIds = user.tenantIds.length > 0 ? user.tenantIds : undefined;
  const runs = await prisma.analysisRun.findMany({
    where: tenantIds ? { tenantId: { in: tenantIds } } : {},
    include: { candidate: true, repository: true },
    orderBy: { createdAt: "desc" },
  });

  const completed = runs.filter((r) => r.status === "completed");
  const avgScore = completed.length
    ? Math.round(
        completed.reduce((acc, r) => acc + (r.overallScore ?? 0), 0) / completed.length,
      )
    : 0;
  const verified = completed.filter((r) => r.verificationLevel === "repo_interview_verified").length;

  return (
    <RoleShell
      title="College workspace"
      subtitle="Track student verification, skill gaps, and placement readiness."
      navLinks={NAV}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Interview verified</p>
            <p className="mt-2 font-display text-4xl text-ink">{verified}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardBody>
          {runs.length === 0 ? (
            <ScaffoldNotice detail="No tenant-scoped runs yet. Invite students from /college/invite (coming next slice)." />
          ) : (
            <ul className="divide-y divide-border">
              {runs.slice(0, 12).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link href={`/mission/${r.id}`} className="text-sm text-ink hover:text-accent">
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
