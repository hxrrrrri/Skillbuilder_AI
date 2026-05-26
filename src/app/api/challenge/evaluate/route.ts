import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import { recomputeOverall } from "@/agents/skill-graph";
import type { AICollabEvaluation } from "@/agents/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  run_id: z.string(),
  challenge_prompt: z.string().min(5).max(2000),
  proposed_diff: z.string().min(2).max(20000),
  explanation: z.string().min(2).max(8000),
  tool_used: z.enum(["Claude Code", "Codex", "Cursor", "Gemini", "Manual", "Other"]).default("Other"),
});

const SYSTEM = `You are the AI Collaboration evaluator of SkillProof AI.
You judge how a candidate worked WITH AI on a small repo improvement.
Score adversarially. A polished-sounding answer with no test awareness is not a high score.
Return STRICT JSON:
{
  "correctness_score": number (0-100),
  "explanation_quality_score": number (0-100),
  "test_awareness_score": number (0-100),
  "review_discipline_score": number (0-100),
  "ai_collaboration_maturity_score": number (0-100),
  "overall_score": number (0-100),
  "tool_used": string,
  "feedback": string
}`;

function heuristicScore(body: z.infer<typeof Body>): AICollabEvaluation {
  const diff = body.proposed_diff;
  const exp = body.explanation;
  const hasTests = /\btest\b|\bspec\b|\bdescribe\(|\bit\(|\bexpect\(/i.test(diff);
  const mentionsTests = /\btest|\bspec|\bcover/i.test(exp);
  const mentionsReview = /\breview|\bcaveat|\blimitation|\btradeoff/i.test(exp);
  const mentionsAI = /\b(claude|gpt|copilot|cursor|gemini|ai)\b/i.test(exp);
  const correctness = Math.min(100, 50 + (diff.length > 200 ? 15 : 0) + (hasTests ? 10 : 0));
  const explanation = Math.min(100, 50 + (exp.length > 200 ? 15 : 0) + (mentionsReview ? 10 : 0));
  const testAware = mentionsTests || hasTests ? 75 : 40;
  const review = mentionsReview ? 70 : 50;
  const maturity = mentionsAI && mentionsReview ? 75 : 55;
  const overall = Math.round((correctness + explanation + testAware + review + maturity) / 5);
  return {
    correctness_score: correctness,
    explanation_quality_score: explanation,
    test_awareness_score: testAware,
    review_discipline_score: review,
    ai_collaboration_maturity_score: maturity,
    overall_score: overall,
    tool_used: body.tool_used,
    feedback: "Heuristic evaluation: looked at length, test mentions, review/limitation language, and explicit AI tool mention.",
  };
}

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const run = await prisma.analysisRun.findUnique({ where: { id: body.run_id } });
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });

  let out: AICollabEvaluation;
  const baseline = heuristicScore(body);

  if (isMockMode()) {
    out = baseline;
  } else {
    const user = `Challenge prompt: ${body.challenge_prompt}
Tool the candidate says they used: ${body.tool_used}

Proposed diff:
\`\`\`
${body.proposed_diff.slice(0, 8000)}
\`\`\`

Candidate explanation:
"""${body.explanation.slice(0, 4000)}"""

Heuristic baseline: ${JSON.stringify(baseline)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "validator", system: SYSTEM, user, maxTokens: 900 });
      out = extractJson<AICollabEvaluation>(r.text) ?? baseline;
    } catch {
      out = baseline;
    }
  }

  await prisma.analysisRun.update({
    where: { id: body.run_id },
    data: { aiCollaboration: JSON.stringify(out) },
  });

  // Persist as a skill score so it counts in the rubric.
  const existing = await prisma.skillScore.findFirst({
    where: { runId: body.run_id, skillName: "AI Collaboration" },
  });
  const data = {
    runId: body.run_id,
    skillName: "AI Collaboration",
    score: out.overall_score,
    confidence: isMockMode() ? 0.5 : 0.8,
    scoreSource: isMockMode() ? "mock" : "llm",
    evidence: JSON.stringify([{ reason: `AI Collaboration challenge submission (${out.tool_used}). ${out.feedback}` }]),
  };
  if (existing) {
    await prisma.skillScore.update({ where: { id: existing.id }, data });
  } else {
    await prisma.skillScore.create({ data });
  }

  const allScores = await prisma.skillScore.findMany({ where: { runId: body.run_id } });
  const { overall } = recomputeOverall(
    allScores.filter((s) => s.score >= 0).map((s) => ({ skillName: s.skillName, score: s.score }))
  );
  await prisma.analysisRun.update({
    where: { id: body.run_id },
    data: { overallScore: overall },
  });

  return NextResponse.json({ evaluation: out, new_overall_score: overall });
}
