import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InterviewFlow, type InterviewQuestionView } from "@/components/interview-flow";
import { CANDIDATE_NAV } from "../../_nav";

export const dynamic = "force-dynamic";

export default async function CandidateInterviewPage({ params }: { params: { runId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/candidate/interview/${params.runId}`);

  const run = await prisma.analysisRun.findUnique({
    where: { id: params.runId },
    include: { repository: true, candidate: true, questions: { orderBy: { id: "asc" } } },
  });
  if (!run) notFound();

  const ownerId = run.createdByUserId ?? run.candidate?.userId ?? null;
  if (ownerId && ownerId !== user.id && !isAdminRole(user.role)) {
    return (
      <RoleShell
        title="Interview"
        subtitle="Answer questions grounded in your own repo."
        navLinks={CANDIDATE_NAV}
        activeHref="/candidate/runs"
      >
        <Card>
          <CardBody>
            <ScaffoldNotice title="Not your run" detail="Only the run owner can take this interview." />
          </CardBody>
        </Card>
      </RoleShell>
    );
  }

  if (run.questions.length === 0) {
    return (
      <RoleShell
        title={`Interview · ${run.repository.owner}/${run.repository.repoName}`}
        subtitle="Answer the interview-gen questions one at a time."
        navLinks={CANDIDATE_NAV}
        activeHref="/candidate/runs"
      >
        <Card>
          <CardBody>
            <ScaffoldNotice detail="No interview questions on this run yet. Wait for the pipeline to finish, then return here." />
          </CardBody>
        </Card>
      </RoleShell>
    );
  }

  const initialQuestions: InterviewQuestionView[] = run.questions.map((q) => ({
    id: q.id,
    question: q.question,
    sourceFile: q.sourceFile,
    lineStart: q.lineStart,
    lineEnd: q.lineEnd,
    expectedSignals: safeJsonParse<string[]>(q.expectedSignals, []),
    redFlags: safeJsonParse<string[]>(q.redFlags, []),
    answer: q.answer,
    answerScore: q.answerScore,
    feedback: q.feedback,
    dimensionScores: safeJsonParse<Record<string, number> | null>(q.dimensionScores, null),
  }));

  return (
    <RoleShell
      title={`Interview · ${run.repository.owner}/${run.repository.repoName}`}
      subtitle="One question per screen. Per-dimension feedback after each answer. Validator scores in fresh context."
      navLinks={CANDIDATE_NAV}
      activeHref="/candidate/runs"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge>{run.targetRole}</Badge>
        <Badge tone={run.verificationLevel === "repo_interview_verified" ? "good" : "default"}>
          {run.verificationLevel === "repo_interview_verified" ? "Repo + Interview verified" : "Repo-only verified"}
        </Badge>
      </div>
      <InterviewFlow runId={run.id} initialQuestions={initialQuestions} />
    </RoleShell>
  );
}
