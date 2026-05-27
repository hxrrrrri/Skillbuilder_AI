import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isMockMode } from "@/lib/claude";
import { recomputeOverall } from "@/agents/skill-graph";
import { runAgentJson } from "@/lib/providers/run-agent";
import { safeJsonParse } from "@/lib/utils";
import type { AICollabEvaluation, MissionState } from "@/agents/types";
import type { ExecutionMode, TerminalEvidence } from "@/lib/local-runner/types";
import type { ProviderMatrix } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  run_id: z.string(),
  challenge_prompt: z.string().min(5).max(2000),
  challenge_id: z.string().optional(),
  target_files: z.array(z.string()).max(8).default([]),
  expected_capabilities: z.array(z.string()).max(12).default([]),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  proposed_diff: z.string().min(2).max(20000),
  explanation: z.string().min(2).max(8000),
  tests_changed: z.string().max(2000).optional(),
  reviewed_ai_output: z.boolean().default(false),
  limitations_discussed: z.boolean().default(false),
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

const SCHEMA_HINT = '{"correctness_score":number,"explanation_quality_score":number,"test_awareness_score":number,"review_discipline_score":number,"ai_collaboration_maturity_score":number,"overall_score":number,"tool_used":string,"feedback":string}';

function heuristicScore(body: z.infer<typeof Body>): AICollabEvaluation {
  const diff = body.proposed_diff;
  const exp = body.explanation;
  const targetHits = body.target_files.filter((file) => diff.includes(file) || diff.includes(`a/${file}`) || diff.includes(`b/${file}`));
  const hasTests = /\btest\b|\bspec\b|\bdescribe\(|\bit\(|\bexpect\(/i.test(diff);
  const mentionsTests = /\btest|\bspec|\bcover/i.test(exp) || !!body.tests_changed;
  const mentionsReview = body.reviewed_ai_output || /\breview|\bcaveat|\blimitation|\btradeoff/i.test(exp);
  const mentionsAI = /\b(claude|gpt|copilot|cursor|gemini|ai)\b/i.test(exp);
  const explanationMatches = targetHits.length > 0 && targetHits.some((file) => exp.includes(file.split("/").pop() ?? file));
  const correctness = Math.min(100, 42 + (diff.length > 200 ? 12 : 0) + (targetHits.length ? 18 : -10) + (explanationMatches ? 8 : 0) + (hasTests ? 8 : 0));
  const explanation = Math.min(100, 45 + (exp.length > 200 ? 12 : 0) + (mentionsReview ? 10 : 0) + (explanationMatches ? 12 : 0));
  const testAware = mentionsTests || hasTests ? 75 : 40;
  const review = mentionsReview ? 75 : 45;
  const maturity = mentionsAI && mentionsReview && (body.limitations_discussed || /\blimitation|tradeoff|risk|follow-up/i.test(exp)) ? 80 : mentionsAI ? 62 : 52;
  const overall = Math.round((correctness + explanation + testAware + review + maturity) / 5);
  return {
    challenge_id: body.challenge_id,
    prompt: body.challenge_prompt,
    target_files: body.target_files,
    expected_capabilities: body.expected_capabilities,
    difficulty: body.difficulty,
    correctness_score: correctness,
    explanation_quality_score: explanation,
    test_awareness_score: testAware,
    review_discipline_score: review,
    ai_collaboration_maturity_score: maturity,
    overall_score: overall,
    tool_used: body.tool_used,
    feedback: targetHits.length
      ? "Heuristic evaluation: diff touched target repo files, explanation/test awareness/review discipline were scored against the challenge."
      : "Heuristic evaluation: diff did not clearly touch the target files, so correctness was capped.",
    what_this_proves: [
      targetHits.length ? "Can target changes to the relevant repo area." : "Target-file alignment still needs proof.",
      mentionsTests ? "Considers tests or justifies test scope." : "Test discipline not demonstrated.",
      mentionsReview ? "Reviews AI output instead of blindly accepting it." : "AI review discipline not demonstrated.",
    ],
    evidence: [
      { reason: `AI challenge diff touched ${targetHits.length}/${body.target_files.length || 1} target files.`, source: "challenge" },
      { reason: `Candidate used ${body.tool_used}; reviewed=${body.reviewed_ai_output}; limitations=${body.limitations_discussed}.`, source: "challenge" },
    ],
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

  const baseline = heuristicScore(body);
  const mode: ExecutionMode = (run.executionMode as ExecutionMode) ?? "api";

  const state: MissionState = {
    mission_id: `challenge_${body.run_id.slice(0, 8)}`,
    run_id: body.run_id,
    target_role: run.targetRole,
    candidate_level: run.candidateLevel ?? "",
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
    provider_matrix: safeJsonParse<ProviderMatrix | null>(run.providerMatrix ?? null, null),
    terminal_evidence: safeJsonParse<TerminalEvidence[]>(run.terminalEvidence ?? null, []),
    ownership_status: safeJsonParse(run.ownershipStatus ?? null, null),
  };

  const user = `Challenge prompt: ${body.challenge_prompt}
Tool the candidate says they used: ${body.tool_used}
Target files: ${body.target_files.join(", ") || "(not supplied)"}
Expected capabilities: ${body.expected_capabilities.join(", ") || "(not supplied)"}
Candidate says tests changed/added: ${body.tests_changed || "(not supplied)"}
Candidate reviewed AI output: ${body.reviewed_ai_output}
Candidate discussed limitations/tradeoffs: ${body.limitations_discussed}

Proposed diff:
\`\`\`
${body.proposed_diff.slice(0, 8000)}
\`\`\`

Candidate explanation:
"""${body.explanation.slice(0, 4000)}"""

Heuristic baseline: ${JSON.stringify(baseline)}

Return the JSON now.`;

  const res = await runAgentJson<AICollabEvaluation>({
    state,
    agentName: "ai-collaboration-evaluator",
    role: "validator",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 900,
    fallback: () => baseline,
  });

  const out = res.output;
  out.challenge_id = out.challenge_id ?? body.challenge_id;
  out.prompt = out.prompt ?? body.challenge_prompt;
  out.target_files = out.target_files ?? body.target_files;
  out.expected_capabilities = out.expected_capabilities ?? body.expected_capabilities;
  out.difficulty = out.difficulty ?? body.difficulty;
  out.evidence = out.evidence ?? baseline.evidence;
  out.what_this_proves = out.what_this_proves ?? baseline.what_this_proves;

  await prisma.analysisRun.update({
    where: { id: body.run_id },
    data: { aiCollaboration: JSON.stringify(out) },
  });

  const existing = await prisma.skillScore.findFirst({
    where: { runId: body.run_id, skillName: "AI Collaboration" },
  });
  const data = {
    runId: body.run_id,
    skillName: "AI Collaboration",
    score: out.overall_score,
    confidence: res.source === "llm" ? 0.8 : 0.5,
    scoreSource: res.source,
    evidence: JSON.stringify(out.evidence?.length ? out.evidence : [{ reason: `AI Collaboration challenge submission (${out.tool_used}). ${out.feedback}`, source: "challenge" }]),
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
