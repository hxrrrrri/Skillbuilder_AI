import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { recomputeOverall } from "@/agents/skill-graph";
import { runAgentJson } from "@/lib/providers/run-agent";
import { ProviderExecutionError, providerErrorMetadata } from "@/lib/providers/errors";
import { safeJsonParse } from "@/lib/utils";
import type { AICollabEvaluation, MissionState } from "@/agents/types";
import type { ExecutionMode, TerminalEvidence } from "@/lib/local-runner/types";
import type { ProviderMatrix } from "@/lib/providers/types";
import { getCurrentUser } from "@/lib/auth/session";
import { evaluateRunMutationAccess } from "@/lib/auth/guards-api";
import { writeAuditLog } from "@/lib/auth/audit";
import { applyAiChallengeScoreCaps, buildAiChallengeExecutionProof } from "@/lib/ai-challenge/evaluation";
import { RATE_LIMITS, rateLimitKey, rateLimitedResponseInit } from "@/lib/rate-limit";
import {
  completeEvaluatorSkillRun,
  failEvaluatorSkillRun,
  prepareEvaluatorSkillRun,
} from "@/lib/evaluator-runtime/skill-runner";

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

function deterministicContext(body: z.infer<typeof Body>): Pick<AICollabEvaluation, "challenge_id" | "prompt" | "target_files" | "expected_capabilities" | "difficulty" | "tool_used" | "evidence" | "what_this_proves"> {
  const diff = body.proposed_diff;
  const exp = body.explanation;
  const targetHits = body.target_files.filter((file) => diff.includes(file) || diff.includes(`a/${file}`) || diff.includes(`b/${file}`));
  const hasTests = /\btest\b|\bspec\b|\bdescribe\(|\bit\(|\bexpect\(/i.test(diff);
  const mentionsTests = /\btest|\bspec|\bcover/i.test(exp) || !!body.tests_changed;
  const mentionsReview = body.reviewed_ai_output || /\breview|\bcaveat|\blimitation|\btradeoff/i.test(exp);
  return {
    challenge_id: body.challenge_id,
    prompt: body.challenge_prompt,
    target_files: body.target_files,
    expected_capabilities: body.expected_capabilities,
    difficulty: body.difficulty,
    tool_used: body.tool_used,
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

  const run = await prisma.analysisRun.findUnique({
    where: { id: body.run_id },
    include: { repository: true },
  });
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });

  // Authorization: only owners/creators/admins/tenant members may submit challenge results.
  const access = await prisma.analysisRun.findUnique({
    where: { id: body.run_id },
    select: { id: true, candidateId: true, createdByUserId: true, tenantId: true, candidate: { select: { userId: true } } },
  });
  if (!access) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  const sessionUser = await getCurrentUser();
  const decision = evaluateRunMutationAccess(sessionUser, {
    candidateId: access.candidateId,
    createdByUserId: access.createdByUserId,
    tenantId: access.tenantId,
    candidateUserId: access.candidate?.userId ?? null,
  }, "submit_ai_challenge");
  if (!decision.ok) {
    await writeAuditLog({
      action: "challenge.evaluate.denied",
      actorUserId: sessionUser?.id ?? null,
      tenantId: access.tenantId ?? null,
      targetType: "AnalysisRun",
      targetId: access.id,
      metadata: { reason: decision.reason },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    }).catch(() => {});
    return decision.response;
  }

  // Throttle before the workspace diff application + LLM evaluation below.
  const rl = RATE_LIMITS.challenge.consume(rateLimitKey(req, sessionUser?.id));
  if (!rl.allowed) {
    const init = rateLimitedResponseInit(rl);
    return NextResponse.json(init.body, { status: init.status, headers: init.headers });
  }

  const deterministic = deterministicContext(body);
  const mode: ExecutionMode = (run.executionMode as ExecutionMode) ?? "api";
  const executionProof = await buildAiChallengeExecutionProof({
    runId: body.run_id,
    repoUrl: run.repository.repoUrl,
    proposedDiff: body.proposed_diff,
  });

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
    mock_mode: false,
    execution_mode: mode,
    provider_matrix: safeJsonParse<ProviderMatrix | null>(run.providerMatrix ?? null, null),
    terminal_evidence: [
      ...safeJsonParse<TerminalEvidence[]>(run.terminalEvidence ?? null, []),
      ...executionProof.checks.map((check) => ({
        commandRunId: check.commandRunId,
        command: check.command,
        cwd: executionProof.workspace ?? "",
        exitCode: check.exitCode,
        stdoutSummary: check.stdoutSummary ?? "",
        stderrSummary: check.stderrSummary ?? "",
        durationMs: 0,
        usedFor: check.usedFor,
        evidenceSource: "ai_challenge_workspace" as const,
        includeInReport: true,
      })),
    ],
    ownership_status: safeJsonParse(run.ownershipStatus ?? null, null),
  };

  const promptUser = `Challenge prompt: ${body.challenge_prompt}
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

Deterministic submission context: ${JSON.stringify(deterministic)}

Return the JSON now.`;

  const preparedSkillRun = await prepareEvaluatorSkillRun({
    agentName: "ai-collaboration-evaluator",
    runId: body.run_id,
    tenantId: access.tenantId,
    state,
  });
  const agentEvent = await prisma.agentEvent.create({
    data: {
      runId: body.run_id,
      agentName: "ai-collaboration-evaluator",
      status: "running",
      startedAt: new Date(),
      order: 100,
    },
  });

  let res;
  try {
    res = await runAgentJson<AICollabEvaluation>({
      state,
      agentName: "ai-collaboration-evaluator",
      role: "validator",
      system: SYSTEM,
      user: promptUser,
      schemaHint: SCHEMA_HINT,
      maxTokens: 900,
    });
  } catch (err) {
    await prisma.agentEvent.update({
      where: { id: agentEvent.id },
      data: { status: "failed", completedAt: new Date(), notes: err instanceof Error ? err.message : String(err) },
    }).catch(() => {});
    await failEvaluatorSkillRun({ prepared: preparedSkillRun, state, error: err }).catch(() => {});
    if (err instanceof ProviderExecutionError) {
      return NextResponse.json(
        {
          error: err.code,
          message: err.message,
          provider: err.provider,
          fix: err.fix,
          trace: providerErrorMetadata(err),
        },
        { status: err.code === "provider_invalid_json" ? 502 : 503 },
      );
    }
    throw err;
  }

  const out = applyAiChallengeScoreCaps(res.output, {
    patchStatus: executionProof.patchStatus,
    checks: executionProof.checks,
    reviewedAiOutput: body.reviewed_ai_output,
    limitationsDiscussed: body.limitations_discussed,
  });
  out.challenge_id = out.challenge_id ?? body.challenge_id;
  out.prompt = out.prompt ?? body.challenge_prompt;
  out.target_files = out.target_files ?? body.target_files;
  out.expected_capabilities = out.expected_capabilities ?? body.expected_capabilities;
  out.difficulty = out.difficulty ?? body.difficulty;
  out.evidence = [...(out.evidence ?? deterministic.evidence ?? []), ...executionProof.evidence];
  out.what_this_proves = [
    ...(out.what_this_proves ?? deterministic.what_this_proves ?? []),
    ...executionProof.whatThisProves,
    ...executionProof.remainingUnverified.map((item) => `Unverified: ${item}`),
  ];

  await prisma.analysisRun.update({
    where: { id: body.run_id },
    data: {
      aiCollaboration: JSON.stringify({
        ...out,
        execution_proof: {
          patch_status: executionProof.patchStatus,
          patch_failure_reason: executionProof.patchFailureReason ?? null,
          checks: executionProof.checks,
          remaining_unverified: executionProof.remainingUnverified,
        },
      }),
    },
  });

  const existing = await prisma.skillScore.findFirst({
    where: { runId: body.run_id, skillName: "AI Collaboration" },
  });
  const data = {
    runId: body.run_id,
    skillName: "AI Collaboration",
    score: out.overall_score,
    confidence: 0.8,
    scoreSource: "challenge",
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

  await prisma.evidenceFinding.create({
    data: {
      runId: body.run_id,
      category: "ai_collaboration",
      claim: `AI-collaboration challenge evaluated with ${out.tool_used}.`,
      evidenceType: "challenge_submission",
      filePath: body.target_files[0] ?? null,
      lineStart: null,
      lineEnd: null,
      confidence: 0.8,
      severity: null,
      candidateSafe: true,
      employerSafe: true,
      publicSafe: true,
      adminOnly: false,
      redactedText: `AI collaboration score ${out.overall_score}/100. ${out.feedback}`,
    },
  });
  for (const check of executionProof.checks) {
    await prisma.evidenceFinding.create({
      data: {
        runId: body.run_id,
        category: "ai_collaboration_execution",
        claim: `AI challenge check '${check.command}' exited ${check.exitCode}.`,
        evidenceType: "terminal_command",
        commandRunId: check.commandRunId ?? null,
        confidence: check.exitCode === 0 ? 0.85 : 0.7,
        candidateSafe: true,
        employerSafe: true,
        publicSafe: false,
        adminOnly: false,
        redactedText: `Challenge check ${check.usedFor}: ${check.command} exited ${check.exitCode}.`,
      },
    });
  }

  const handoff = {
    agent: "ai-collaboration-evaluator" as const,
    completed: ["ai_challenge_scored", "execution_proof_recorded"],
    unresolved: executionProof.remainingUnverified,
    evidence: out.evidence ?? [],
    commands_run: executionProof.checks.map((check) => ({ cmd: check.command, exitCode: check.exitCode ?? undefined })),
    issues_found: executionProof.remainingUnverified,
    output: out,
  };
  await completeEvaluatorSkillRun({ prepared: preparedSkillRun, state, handoff }).catch(() => {});
  await prisma.agentEvent.update({
    where: { id: agentEvent.id },
    data: {
      status: "completed",
      completedAt: new Date(),
      output: JSON.stringify(handoff),
      notes: executionProof.remainingUnverified.join(" | "),
    },
  });

  await writeAuditLog({
    action: "challenge.evaluate.completed",
    actorUserId: sessionUser?.id ?? null,
    tenantId: access.tenantId ?? sessionUser?.primaryTenantId ?? null,
    targetType: "AnalysisRun",
    targetId: body.run_id,
    metadata: {
      overall_score: out.overall_score,
      new_overall_score: overall,
      tool_used: out.tool_used,
      challenge_id: out.challenge_id ?? null,
    },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  }).catch(() => {});

  return NextResponse.json({ evaluation: out, new_overall_score: overall });
}
