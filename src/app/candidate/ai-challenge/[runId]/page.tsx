import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIChallengeWizard } from "@/components/ai-challenge-wizard";
import { CANDIDATE_NAV } from "../../_nav";

export const dynamic = "force-dynamic";

export default async function CandidateAIChallengePage({ params }: { params: { runId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/candidate/ai-challenge/${params.runId}`);

  const run = await prisma.analysisRun.findUnique({
    where: { id: params.runId },
    include: { repository: true, candidate: true },
  });
  if (!run) notFound();

  const ownerId = run.createdByUserId ?? run.candidate?.userId ?? null;
  if (ownerId && ownerId !== user.id && !isAdminRole(user.role)) {
    return (
      <RoleShell
        title="AI Collaboration challenge"
        subtitle="Prove how you work with AI."
        navLinks={CANDIDATE_NAV}
        activeHref="/candidate/runs"
      >
        <Card>
          <CardBody>
            <ScaffoldNotice title="Not your run" detail="Only the run owner can submit this challenge." />
          </CardBody>
        </Card>
      </RoleShell>
    );
  }

  const contextPack = safeJsonParse<any>(run.contextPack, null);
  const importantFiles: string[] = contextPack?.filesIndex?.important ?? [];
  const existing = safeJsonParse<any>(run.aiCollaboration, null);

  return (
    <RoleShell
      title={`AI Collaboration challenge · ${run.repository.owner}/${run.repository.repoName}`}
      subtitle="Multi-step submission. The evaluator scores correctness, explanation, test awareness, review discipline, and AI maturity."
      navLinks={CANDIDATE_NAV}
      activeHref="/candidate/runs"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge>{run.targetRole}</Badge>
        <Badge tone={run.status === "completed" ? "good" : "warn"}>{run.status}</Badge>
        {run.overallScore != null && <Badge tone="accent">overall {run.overallScore}</Badge>}
        {existing && <Badge tone="good">already submitted — {existing.overall_score}/100</Badge>}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{existing ? "Resubmit (overrides previous score)" : "Submit challenge"}</CardTitle>
        </CardHeader>
        <CardBody>
          <AIChallengeWizard runId={run.id} importantFiles={importantFiles} existing={existing} />
        </CardBody>
      </Card>
    </RoleShell>
  );
}
