import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const run = await prisma.analysisRun.findUnique({
    where: { id: params.id },
    include: {
      repository: true,
      events: { orderBy: { order: "asc" } },
      scores: true,
      questions: true,
    },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    id: run.id,
    status: run.status,
    overall_score: run.overallScore,
    role_fit: run.roleFit,
    target_role: run.targetRole,
    candidate_level: run.candidateLevel,
    tokens: {
      raw: run.tokenEstimateRaw ?? 0,
      used: run.tokenEstimateUsed ?? 0,
    },
    repo: {
      url: run.repository.repoUrl,
      name: run.repository.repoName,
      owner: run.repository.owner,
    },
    events: run.events.map((e) => ({
      agent: e.agentName,
      status: e.status,
      order: e.order,
      started_at: e.startedAt,
      completed_at: e.completedAt,
      notes: e.notes,
      output: safeJsonParse(e.output, null),
    })),
    scores: run.scores.map((s) => ({
      skill: s.skillName,
      score: s.score,
      confidence: s.confidence,
      evidence: safeJsonParse(s.evidence, []),
      validator_notes: s.validatorNotes,
    })),
    questions: run.questions.map((q) => ({
      id: q.id,
      question: q.question,
      source_file: q.sourceFile,
      expected_signals: safeJsonParse<string[]>(q.expectedSignals, []),
      answer: q.answer,
      answer_score: q.answerScore,
      feedback: q.feedback,
    })),
    contract: safeJsonParse(run.validationContract, null),
    created_at: run.createdAt,
    completed_at: run.completedAt,
  });
}
