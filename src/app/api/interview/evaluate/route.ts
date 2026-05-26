import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { evaluateAnswer } from "@/agents/answer-evaluator";
import { safeJsonParse } from "@/lib/utils";
import type { MissionState } from "@/agents/types";

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

  // Build a minimal mission state for the evaluator. Fresh context — we deliberately
  // do NOT load prior agent outputs into the validator's context.
  const state: MissionState = {
    mission_id: `eval_${q.runId.slice(0, 8)}`,
    run_id: q.runId,
    target_role: "",
    candidate_level: "",
    contract: null,
    context_pack: null,
    scores: [],
    handoffs: [],
    tokens_in: 0,
    tokens_out: 0,
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
    data: { answer: body.answer, answerScore: blended, feedback: evalOut.summary },
  });

  return NextResponse.json({
    evaluation: evalOut,
    blended_score: blended,
  });
}
