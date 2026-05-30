import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/session";
import { evaluateRunAccess } from "@/lib/auth/guards-api";
import { writeAuditLog } from "@/lib/auth/audit";
import { estimateCostLabel } from "@/lib/providers/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live agent-inspection endpoint backing the AgentTraceDrawer.
//
// Security model (mirrors /api/runs/[id]):
//  - Auth required; anonymous = 401, no run-existence leak.
//  - Access is re-derived from evaluateRunAccess (admin / creator / candidate
//    owner / tenant member). Non-admins get a redacted candidate-safe view.
//  - Never returns raw secrets, raw prompts, or raw terminal stdout/stderr.
//    Admin gets runtime metadata, SkillRun/EvidenceFinding rows, terminal command
//    SUMMARIES (command + exit code + hash, never log bodies), parsed model JSON,
//    handoff JSON, and adminTraceJson. Candidates get only safe findings/evidence.

function getRequestIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

export async function GET(req: Request, { params }: { params: { id: string; agentName: string } }) {
  const ip = getRequestIp(req);
  const userAgent = req.headers.get("user-agent");
  const agentName = decodeURIComponent(params.agentName);

  const user = await getCurrentUser();

  const accessRow = await prisma.analysisRun.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      candidateId: true,
      createdByUserId: true,
      tenantId: true,
      candidate: { select: { userId: true } },
    },
  });

  if (!accessRow) {
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const decision = evaluateRunAccess(user, {
    candidateId: accessRow.candidateId,
    createdByUserId: accessRow.createdByUserId,
    tenantId: accessRow.tenantId,
    candidateUserId: accessRow.candidate?.userId ?? null,
  });

  if (!decision.ok) {
    await writeAuditLog({
      action: "run.agent.read.denied",
      actorUserId: user?.id ?? null,
      tenantId: accessRow.tenantId,
      targetType: "AnalysisRun",
      targetId: accessRow.id,
      metadata: { reason: decision.reason, agent: agentName, role: user?.role ?? null },
      ip,
      userAgent,
    }).catch(() => {});
    return decision.response;
  }

  const isAdmin = decision.reason === "admin";

  // Load the agent event + its provenance. SkillRun.agentId matches the agent name.
  const event = await prisma.agentEvent.findFirst({
    where: { runId: accessRow.id, agentName },
    orderBy: { order: "asc" },
  });
  const skillRuns = await prisma.skillRun.findMany({
    where: { runId: accessRow.id, agentId: agentName },
    orderBy: { startedAt: "asc" },
  });
  const skillRunIds = skillRuns.map((s) => s.id);
  const evidence = skillRunIds.length
    ? await prisma.evidenceFinding.findMany({ where: { runId: accessRow.id, skillRunId: { in: skillRunIds } }, orderBy: { confidence: "desc" } })
    : await prisma.evidenceFinding.findMany({ where: { runId: accessRow.id }, orderBy: { confidence: "desc" }, take: 50 });
  const terminal = isAdmin
    ? await prisma.terminalCommandRun.findMany({ where: { runId: accessRow.id }, orderBy: { ranAt: "asc" }, take: 50 })
    : [];

  const handoff = safeJsonParse<any>(event?.output ?? null, null);
  const output = handoff?.output && typeof handoff.output === "object" ? handoff.output : {};
  const runtime = handoff?.runtime ?? output?.runtime ?? null;

  const status = event?.status ?? "pending";
  const startedAt = event?.startedAt ?? null;
  const completedAt = event?.completedAt ?? null;
  const durationMs = startedAt && completedAt ? new Date(completedAt).getTime() - new Date(startedAt).getTime() : null;

  const completed = strArr(handoff?.completed);
  const issues = strArr(handoff?.issues_found);
  const unresolved = strArr(handoff?.unresolved);
  const safeFindings = [
    ...completed,
    ...strArr(output?.strengths),
    ...strArr(output?.observations),
    ...strArr(output?.positive_signals),
  ].slice(0, 8);
  const missingProof = [...unresolved, ...issues].slice(0, 8);
  const nextAction = handoff?.next_recommended
    ? `Next agent: ${handoff.next_recommended}`
    : missingProof.length
      ? "Resolve missing proof before relying on this signal."
      : status === "completed"
        ? "Review the evidence linked to this check."
        : "Waiting for this check to finish.";

  const base = {
    ok: true as const,
    run_id: accessRow.id,
    run_status: accessRow.status,
    agent: agentName,
    mode: isAdmin ? ("admin" as const) : ("candidate" as const),
    status,
    found: !!event,
    checks: agentCheckLabel(agentName),
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    safe_findings: safeFindings,
    missing_proof: missingProof,
    next_action: nextAction,
    score_contribution: extractScoreContribution(output),
    polled_at: new Date().toISOString(),
  };

  if (!isAdmin) {
    const candidateView = decision.reason === "creator" || decision.reason === "candidate_owner";
    const safeEvidence = evidence
      .filter((f) => !f.adminOnly && (candidateView ? f.candidateSafe : f.employerSafe))
      .slice(0, 16)
      .map((f) => ({
        id: f.id,
        category: f.category,
        claim: f.claim,
        evidence_type: f.evidenceType,
        file_path: f.filePath,
        line_start: f.lineStart,
        line_end: f.lineEnd,
        confidence: f.confidence,
        severity: f.severity,
        redacted_text: f.redactedText,
      }));
    // Fall back to handoff evidence reasons if no DB findings are tied to this agent.
    const fallbackEvidence =
      safeEvidence.length === 0 && Array.isArray(handoff?.evidence)
        ? handoff.evidence
            .filter((e: any) => typeof e?.reason === "string")
            .slice(0, 8)
            .map((e: any, i: number) => ({
              id: `handoff-${i}`,
              category: "agent_note",
              claim: e.reason,
              evidence_type: "model_note",
              file_path: e.file ?? null,
              line_start: e.line_start ?? null,
              line_end: e.line_end ?? null,
              confidence: typeof e.confidence === "number" ? e.confidence : 0,
              severity: null,
              redacted_text: e.reason,
            }))
        : [];
    return NextResponse.json({ ...base, safe_evidence: safeEvidence.length ? safeEvidence : fallbackEvidence });
  }

  // Admin-safe full view.
  const firstSkill = skillRuns[0] ?? null;
  const tokenIn = Number(runtime?.inputTokens ?? runtime?.input_tokens ?? 0);
  const tokenOut = Number(runtime?.outputTokens ?? runtime?.output_tokens ?? 0);
  const costProvider = runtime?.actualProvider ?? runtime?.provider ?? firstSkill?.providerId ?? null;
  const costModel = runtime?.actualModel ?? runtime?.model ?? firstSkill?.actualModel ?? null;

  const adminPayload = {
    ...base,
    runtime: {
      requested_provider: runtime?.requestedProvider ?? runtime?.provider ?? firstSkill?.providerId ?? null,
      actual_provider: costProvider,
      requested_model: runtime?.requestedModel ?? runtime?.model ?? firstSkill?.requestedModel ?? null,
      actual_model: costModel,
      reasoning_budget: runtime?.reasoningBudget ?? null,
      reasoning: reasoningLabel(runtime?.reasoning),
      temperature: runtime?.temperature ?? null,
      max_tokens: runtime?.maxTokens ?? null,
      input_tokens: tokenIn || null,
      output_tokens: tokenOut || null,
      estimated_cost: estimateCostLabel({ provider: costProvider, model: costModel, inputTokens: tokenIn, outputTokens: tokenOut }),
      prompt_version: runtime?.promptVersion ?? firstSkill?.promptVersionId ?? null,
      fallback_note: runtime?.note ?? firstSkill?.fallbackReason ?? null,
    },
    skill_runs: skillRuns.map((s) => ({
      id: s.id,
      skill_id: s.skillId,
      skill_version: s.skillVersion,
      provider_id: s.providerId,
      requested_model: s.requestedModel,
      actual_model: s.actualModel,
      status: s.status,
      started_at: s.startedAt,
      ended_at: s.endedAt,
      duration_ms: s.durationMs,
      input_hash: s.inputHash,
      output_hash: s.outputHash,
      token_usage: safeJsonParse(s.tokenUsageJson, null),
      cost_estimate: safeJsonParse(s.costEstimateJson, null),
      fallback_reason: s.fallbackReason,
      retry_history: safeJsonParse(s.retryHistoryJson, null),
      prompt_version_id: s.promptVersionId,
      error: s.error,
      candidate_summary: s.candidateSummary,
      employer_summary: s.employerSummary,
    })),
    evidence_findings: evidence.map((f) => ({
      id: f.id,
      skill_run_id: f.skillRunId,
      category: f.category,
      claim: f.claim,
      evidence_type: f.evidenceType,
      file_path: f.filePath,
      line_start: f.lineStart,
      line_end: f.lineEnd,
      commit_sha: f.commitSha,
      confidence: f.confidence,
      severity: f.severity,
      candidate_safe: f.candidateSafe,
      employer_safe: f.employerSafe,
      admin_only: f.adminOnly,
      redacted_text: f.redactedText,
      raw_text_hash: f.rawTextHash,
    })),
    // Command summaries only — never raw stdout/stderr bodies.
    terminal_runs: terminal.map((t) => ({
      id: t.id,
      command: t.command,
      cwd: t.cwd,
      exit_code: t.exitCode,
      duration_ms: t.durationMs,
      used_for: t.usedFor,
      output_hash: t.outputHash,
      ran_at: t.ranAt,
      saved_as_evidence: t.savedAsEvidence,
    })),
    parsed_output: output && Object.keys(output).length ? output : null,
    assertion_results: Array.isArray(handoff?.assertion_results)
      ? handoff.assertion_results
      : Array.isArray(output?.assertion_results)
        ? output.assertion_results
        : [],
    hallucinated_files: Array.isArray(output?.hallucinated_files) ? output.hallucinated_files : [],
    errors: [runtime?.note, handoff?.error, output?.error].filter(Boolean),
    handoff,
    admin_traces: skillRuns.map((s) => safeJsonParse(s.adminTraceJson, null)).filter(Boolean),
    notes: event?.notes ?? null,
  };

  await writeAuditLog({
    action: "run.agent.read",
    actorUserId: decision.user.id,
    tenantId: accessRow.tenantId,
    targetType: "AnalysisRun",
    targetId: accessRow.id,
    metadata: { agent: agentName, role: decision.user.role },
    ip,
    userAgent,
  }).catch(() => {});

  return NextResponse.json(adminPayload);
}

function strArr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function extractScoreContribution(output: Record<string, any>): { metric: string; score: number } | null {
  for (const [key, value] of Object.entries(output ?? {})) {
    if ((key.endsWith("_score") || key === "overall_score") && typeof value === "number") {
      return { metric: key, score: value };
    }
  }
  return null;
}

function reasoningLabel(reasoning: any): string {
  if (!reasoning) return "not recorded";
  if (reasoning.kind === "anthropic_thinking") return reasoning.budgetTokens ? `anthropic ${reasoning.budgetTokens} tokens` : "anthropic off";
  if (reasoning.kind === "openai_effort") return `openai ${reasoning.effort ?? "off"}`;
  return reasoning.reason ?? reasoning.kind ?? "not recorded";
}

function agentCheckLabel(agent: string): string {
  const labels: Record<string, string> = {
    orchestrator: "Defined the validation contract and scoring plan.",
    "repo-scanner": "Mapped repository files, metadata, tests, and framework signals.",
    architecture: "Checked architecture, boundaries, and implementation structure.",
    "code-quality": "Checked maintainability, code clarity, and implementation quality.",
    testing: "Checked test coverage and test quality signals.",
    security: "Checked common security and secret-handling risks.",
    "ai-collaboration": "Checked AI collaboration usage patterns.",
    "git-evidence": "Checked commit history and authorship signals.",
    documentation: "Checked README, docs, and onboarding clarity.",
    authenticity: "Checked ownership and authenticity risk signals.",
    "interview-gen": "Generated own-code interview questions.",
    validator: "Audited claims against the evidence contract.",
    "skill-graph": "Aggregated measured skills without converting not-measured into a score.",
    "profile-gen": "Prepared employer-readable profile and improvement plan summaries.",
  };
  return labels[agent] ?? `Checked ${agent.replace(/-/g, " ")} evidence.`;
}
