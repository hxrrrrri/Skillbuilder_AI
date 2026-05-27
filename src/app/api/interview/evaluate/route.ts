import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { evaluateAnswer } from "@/agents/answer-evaluator";
import { recomputeOverall } from "@/agents/skill-graph";
import { safeJsonParse } from "@/lib/utils";
import { isMockMode } from "@/lib/claude";
import type { MissionState } from "@/agents/types";
import type { ExecutionMode, TerminalEvidence } from "@/lib/local-runner/types";
import type { ProviderMatrix } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  question_id: z.string(),
  answer: z.string().min(2).max(8000),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const q = await prisma.interviewQuestion.findUnique({ where: { id: body.question_id } });
  if (!q) return NextResponse.json({ error: "question_not_found" }, { status: 404 });

  const run = await prisma.analysisRun.findUnique({ where: { id: q.runId } });
  const mode: ExecutionMode = (run?.executionMode as ExecutionMode) ?? "api";
  const state: MissionState = {
    mission_id: `eval_${q.runId.slice(0, 8)}`,
    run_id: q.runId,
    target_role: run?.targetRole ?? "",
    candidate_level: run?.candidateLevel ?? "",
    contract: null,
    context_pack: null,
    scores: [],
    handoffs: [],
    assertion_results: [],
    authenticity: null,
    tokens_in: 0,
    tokens_out: 0,
    mock_mode: mode === "mock" || (mode === "api" && isMockMode()),
    execution_mode: mode,
    provider_matrix: safeJsonParse<ProviderMatrix | null>(run?.providerMatrix ?? null, null),
    terminal_evidence: safeJsonParse<TerminalEvidence[]>(run?.terminalEvidence ?? null, []),
    ownership_status: safeJsonParse(run?.ownershipStatus ?? null, null),
  };

  const handoff = await evaluateAnswer(
    state,
    {
      question: q.question,
      source_file: q.sourceFile,
      expected_signals: safeJsonParse<string[]>(q.expectedSignals, []),
    },
    body.answer
  );

  const evalOut = handoff.output;
  const blended = Math.round(
    (evalOut.communication_score +
      evalOut.debugging_score +
      evalOut.architecture_explanation_score +
      evalOut.testing_reasoning_score +
      evalOut.understanding_of_own_code) /
      5
  );

  await prisma.interviewQuestion.update({
    where: { id: q.id },
    data: {
      answer: body.answer,
      answerScore: blended,
      feedback: evalOut.summary,
      dimensionScores: JSON.stringify({
        communication: evalOut.communication_score,
        debugging: evalOut.debugging_score,
        architecture_explanation: evalOut.architecture_explanation_score,
        testing_reasoning: evalOut.testing_reasoning_score,
        understanding_of_own_code: evalOut.understanding_of_own_code,
      }),
    },
  });

  // Upsert interview-derived skill scores. Don't raise scores already supported by repo evidence
  // unless they're "pending" (no prior measurement) — but for Communication/Debugging the interview
  // IS the primary signal, so we set/overwrite those.
  const interviewSource = isMockMode() ? "mock" : "llm";
  const upserts: Array<{ skill: string; score: number }> = [
    { skill: "Communication", score: evalOut.communication_score },
    { skill: "Debugging", score: evalOut.debugging_score },
  ];
  // Soft-update Architecture/Testing only if missing (don't override repo evidence).
  const existing = await prisma.skillScore.findMany({ where: { runId: q.runId } });
  const existingMap = new Map(existing.map((s) => [s.skillName, s]));

  for (const u of upserts) {
    const e = existingMap.get(u.skill);
    if (e) {
      await prisma.skillScore.update({
        where: { id: e.id },
        data: {
          score: u.score,
          confidence: 0.8,
          scoreSource: interviewSource,
          evidence: JSON.stringify([{ reason: `Interview answer evaluated by fresh-context validator.` }]),
        },
      });
    } else {
      await prisma.skillScore.create({
        data: {
          runId: q.runId,
          skillName: u.skill,
          score: u.score,
          confidence: 0.8,
          scoreSource: interviewSource,
          evidence: JSON.stringify([{ reason: `Interview answer evaluated by fresh-context validator.` }]),
        },
      });
    }
  }

  // Recompute overall using rubric weights.
  const allScores = await prisma.skillScore.findMany({ where: { runId: q.runId } });
  const scoresForOverall = allScores
    .filter((s) => s.score >= 0)
    .map((s) => ({ skillName: s.skillName, score: s.score }));
  const { overall } = recomputeOverall(scoresForOverall);

  await prisma.analysisRun.update({
    where: { id: q.runId },
    data: {
      overallScore: overall,
      verificationLevel: "repo_interview_verified",
    },
  });

  return NextResponse.json({
    evaluation: evalOut,
    blended_score: blended,
    new_overall_score: overall,
    verification_level: "repo_interview_verified",
  });
}
