import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { evaluateRunAccess } from "@/lib/auth/guards-api";
import { isAdminRole } from "@/lib/auth/roles";
import { RoleShell } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: { id: string } }) {
  const viewer = await getCurrentUser();
  const profile = await prisma.publicProfile.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
    include: {
      run: { include: { candidate: true, repository: true, scores: true } },
    },
  });

  const run = profile?.run ?? await prisma.analysisRun.findUnique({
    where: { id: params.id },
    include: { candidate: true, repository: true, scores: true, profiles: true },
  });
  if (!run) return notFound();

  const isOwner =
    !!viewer &&
    (run.createdByUserId === viewer.id ||
      run.candidate?.userId === viewer.id ||
      profile?.ownerUserId === viewer.id);
  const isAdminViewer = !!viewer && isAdminRole(viewer.role);
  const runProfiles = ("profiles" in run ? run.profiles : []) as Array<{ id: string; visibility: string; includeTerminalProof?: boolean }>;
  const publicProfile = profile ?? runProfiles.find((p) => p.visibility !== "private") ?? null;
  const publicAllowed = !!publicProfile && publicProfile.visibility !== "private";

  if (!publicAllowed && !isOwner && !isAdminViewer) {
    const decision = evaluateRunAccess(viewer, {
      candidateId: run.candidateId,
      createdByUserId: run.createdByUserId,
      tenantId: run.tenantId,
      candidateUserId: run.candidate?.userId ?? null,
    });
    if (!decision.ok) return notFound();
  }

  const measured = run.scores.filter((s) => s.score >= 0);
  const notMeasured = run.scores.filter((s) => s.score < 0).map((s) => s.skillName);
  const reportHref = publicProfile
    ? `/api/report/export?profile_id=${publicProfile.id}`
    : `/api/report/export?run_id=${run.id}`;

  return (
    <RoleShell
      title="SkillProof Report"
      subtitle="Redacted report view backed by the verification run."
      navLinks={[]}
      activeHref="/report"
    >
      <Card>
        <CardHeader>
          <CardTitle>{run.candidate?.name ?? "Anonymous Candidate"}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{run.overallScore ?? "Not scored"}</Badge>
            <Badge>{run.targetRole}</Badge>
            <Badge tone={run.verificationLevel === "repo_interview_verified" ? "good" : "default"}>
              {run.verificationLevel.replace(/_/g, " ")}
            </Badge>
          </div>
          <div className="text-sm text-muted">
            {run.repository.owner}/{run.repository.repoName} · {run.status}
          </div>
          <a className="inline-flex rounded-md border border-border px-3 py-2 text-sm text-ink hover:border-accent/60" href={reportHref}>
            Download Report.md
          </a>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skill Coverage</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {measured.map((s) => (
              <div key={s.id} className="rounded-md border border-border p-3">
                <div className="text-sm text-ink">{s.skillName}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone={s.score >= 70 ? "good" : s.score >= 50 ? "warn" : "bad"}>{s.score}/100</Badge>
                  <span className="text-xs text-muted">{s.scoreSource}</span>
                </div>
              </div>
            ))}
          </div>
          {notMeasured.length > 0 && (
            <p className="mt-4 text-sm text-muted">Not measured: {notMeasured.join(", ")}</p>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}
