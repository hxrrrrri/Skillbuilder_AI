import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/session";
import { evaluateRunAccess } from "@/lib/auth/guards-api";
import { writeAuditLog } from "@/lib/auth/audit";
import { isAdminRole } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Best-effort extraction of caller IP from a Next.js Request. */
function getRequestIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ip = getRequestIp(req);
  const userAgent = req.headers.get("user-agent");

  // 1. Resolve the current session up front. Anonymous = 401 (no info leak about
  //    whether the run exists).
  const user = await getCurrentUser();

  // 2. Load only the access-control surface first. We do NOT include candidate
  //    PII / scores / evidence until we've authorized the read. This keeps
  //    forbidden responses cheap and avoids any chance of leaking data via
  //    logs / error paths.
  const accessRow = await prisma.analysisRun.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      candidateId: true,
      createdByUserId: true,
      tenantId: true,
      candidate: { select: { userId: true } },
    },
  });

  if (!accessRow) {
    // Return 404 only to authenticated callers; anonymous callers always see 401.
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const decision = evaluateRunAccess(user, {
    candidateId: accessRow.candidateId,
    createdByUserId: accessRow.createdByUserId,
    tenantId: accessRow.tenantId,
    candidateUserId: accessRow.candidate?.userId ?? null,
  });

  if (!decision.ok) {
    // Audit denied access attempts so we can spot scraping / ID-enumeration.
    await writeAuditLog({
      action: "run.read.denied",
      actorUserId: user?.id ?? null,
      tenantId: accessRow.tenantId,
      targetType: "AnalysisRun",
      targetId: accessRow.id,
      metadata: { reason: decision.reason, role: user?.role ?? null },
      ip,
      userAgent,
    }).catch(() => {
      /* audit failures must never block the response */
    });
    return decision.response;
  }

  // 3. Authorized — now load the full payload.
  const run = await prisma.analysisRun.findUnique({
    where: { id: params.id },
    include: {
      candidate: true,
      repository: true,
      events: { orderBy: { order: "asc" } },
      scores: true,
      questions: true,
      skillRuns: { orderBy: { startedAt: "asc" } },
      evidenceFindings: true,
      harnessSnapshot: true,
    },
  });
  if (!run) {
    // Race: deleted between the two reads.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await writeAuditLog({
    action: "run.read",
    actorUserId: decision.user.id,
    tenantId: run.tenantId,
    targetType: "AnalysisRun",
    targetId: run.id,
    metadata: { reason: decision.reason, role: decision.user.role },
    ip,
    userAgent,
  }).catch(() => {
    /* audit failures must never block the response */
  });

  if (decision.reason === "admin") {
    return NextResponse.json(buildAdminRunPayload(run));
  }

  return NextResponse.json(buildLimitedRunPayload(run, decision.reason));
}

function buildAdminRunPayload(run: any) {
  return {
    id: run.id,
    status: run.status,
    status_message: run.statusMessage,
    overall_score: run.overallScore,
    role_fit: run.roleFit,
    verification_level: run.verificationLevel,
    target_role: run.targetRole,
    candidate_level: run.candidateLevel,
    candidate: run.candidate
      ? { id: run.candidate.id, name: run.candidate.name, github_username: run.candidate.githubUsername }
      : null,
    tokens: {
      raw: run.tokenEstimateRaw ?? 0,
      used: run.tokenEstimateUsed ?? 0,
    },
    repo: {
      url: run.repository.repoUrl,
      name: run.repository.repoName,
      owner: run.repository.owner,
    },
    events: run.events.map((e: any) => ({
      agent: e.agentName,
      status: e.status,
      order: e.order,
      started_at: e.startedAt,
      completed_at: e.completedAt,
      notes: e.notes,
      output: safeJsonParse(e.output, null),
    })),
    skill_runs: (run.skillRuns ?? []).map((s: any) => ({
      id: s.id,
      skill_id: s.skillId,
      skill_version: s.skillVersion,
      agent_id: s.agentId,
      provider_id: s.providerId,
      requested_model: s.requestedModel,
      actual_model: s.actualModel,
      status: s.status,
      started_at: s.startedAt,
      ended_at: s.endedAt,
      duration_ms: s.durationMs,
      input_hash: s.inputHash,
      output_hash: s.outputHash,
      evidence_ids: safeJsonParse(s.evidenceIdsJson, []),
      prompt_version_id: s.promptVersionId,
      tool_permissions: safeJsonParse(s.toolPermissionsJson, null),
      token_usage: safeJsonParse(s.tokenUsageJson, null),
      cost_estimate: safeJsonParse(s.costEstimateJson, null),
      fallback_reason: s.fallbackReason,
      retry_history: safeJsonParse(s.retryHistoryJson, null),
      error: s.error,
      admin_trace: safeJsonParse(s.adminTraceJson, null),
      candidate_summary: s.candidateSummary,
      employer_summary: s.employerSummary,
    })),
    evidence_findings: run.evidenceFindings ?? [],
    harness_snapshot: run.harnessSnapshot,
    scores: run.scores.map((s: any) => ({
      skill: s.skillName,
      score: s.score === -1 ? null : s.score,
      confidence: s.confidence,
      source: s.scoreSource,
      evidence: safeJsonParse(s.evidence, []),
      validator_notes: s.validatorNotes,
    })),
    questions: run.questions.map((q: any) => ({
      id: q.id,
      question: q.question,
      source_file: q.sourceFile,
      line_start: q.lineStart,
      line_end: q.lineEnd,
      expected_signals: safeJsonParse<string[]>(q.expectedSignals, []),
      red_flags: safeJsonParse<string[]>(q.redFlags, []),
      scoring_rubric: safeJsonParse(q.scoringRubric, null),
      answer: q.answer,
      answer_score: q.answerScore,
      feedback: q.feedback,
      dimension_scores: safeJsonParse(q.dimensionScores, null),
    })),
    contract: safeJsonParse(run.validationContract, null),
    validation_coverage: safeJsonParse(run.validationCoverage, []),
    validation_summary: safeJsonParse(run.validationSummary, null),
    authenticity: safeJsonParse(run.authenticitySignals, null),
    improvement_plan: safeJsonParse(run.improvementPlan, null),
    employer_verifier: safeJsonParse(run.employerVerifier, null),
    ai_collaboration: safeJsonParse(run.aiCollaboration, null),
    profile_summary: safeJsonParse(run.profileSummary, null),
    context_pack: safeJsonParse(run.contextPack, null),
    repo_intelligence: safeJsonParse(run.repoIntelligence, null),
    execution_mode: run.executionMode,
    terminal_evidence: safeJsonParse(run.terminalEvidence, []),
    provider_matrix: safeJsonParse(run.providerMatrix, null),
    ownership_status: safeJsonParse(run.ownershipStatus, null),
    mock_mode: run.executionMode === "mock" || run.scores.some((s: any) => ["mock", "heuristic"].includes(s.scoreSource)),
    created_at: run.createdAt,
    completed_at: run.completedAt,
  };
}

function buildLimitedRunPayload(
  run: any,
  reason: "creator" | "candidate_owner" | "tenant_member",
) {
  const isCandidateView = reason === "creator" || reason === "candidate_owner";
  const scores = run.scores.map((s: any) => ({
    skill: s.skillName,
    score: s.score === -1 ? null : s.score,
    confidence: s.confidence,
    source: s.scoreSource,
    evidence: safeJsonParse<any[]>(s.evidence, []).map((e) => ({
      file: e.file,
      line_start: e.line_start ?? e.line,
      line_end: e.line_end,
      reason: e.reason,
      source: e.source,
      confidence: e.confidence,
      validator_note: e.validator_note,
    })),
    validator_notes: s.validatorNotes,
  }));
  const terminalEvidence = safeJsonParse<any[]>(run.terminalEvidence, []);
  const ownershipStatus = safeJsonParse(run.ownershipStatus, null);
  const aiCollaboration = safeJsonParse(run.aiCollaboration, null);
  const validationSummary = safeJsonParse(run.validationSummary, null);
  const providerMatrix = safeJsonParse(run.providerMatrix, null);

  return {
    id: run.id,
    status: run.status,
    status_message: run.statusMessage,
    overall_score: run.overallScore,
    role_fit: run.roleFit,
    verification_level: run.verificationLevel,
    target_role: run.targetRole,
    candidate_level: run.candidateLevel,
    access: reason,
    candidate: run.candidate
      ? { id: run.candidate.id, name: run.candidate.name, github_username: run.candidate.githubUsername }
      : null,
    repo: {
      url: run.repository.repoUrl,
      name: run.repository.repoName,
      owner: run.repository.owner,
    },
    progress: {
      completed: run.events.filter((e: any) => e.status === "completed").length,
      total: run.events.length,
    },
    events: run.events.map(summarizeAgentEvent),
    skill_runs: (run.skillRuns ?? []).map((s: any) => ({
      id: s.id,
      skill_id: s.skillId,
      skill_version: s.skillVersion,
      status: s.status,
      started_at: s.startedAt,
      ended_at: s.endedAt,
      duration_ms: s.durationMs,
      evidence_ids: safeJsonParse(s.evidenceIdsJson, []),
      candidate_summary: s.candidateSummary,
      employer_summary: reason === "tenant_member" ? s.employerSummary : undefined,
    })),
    evidence_findings: (run.evidenceFindings ?? [])
      .filter((f: any) => !f.adminOnly && (isCandidateView ? f.candidateSafe : f.employerSafe))
      .map((f: any) => ({
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
      })),
    harness_snapshot: run.harnessSnapshot
      ? {
          commit_sha: run.harnessSnapshot.commitSha,
          evaluator_runtime_version: run.harnessSnapshot.evaluatorRuntimeVersion,
          validator_version: run.harnessSnapshot.validatorVersion,
          execution_mode: run.harnessSnapshot.executionMode,
          framework_detected: run.harnessSnapshot.frameworkDetected,
          test_framework_detected: run.harnessSnapshot.testFrameworkDetected,
        }
      : null,
    scores,
    questions: isCandidateView
      ? run.questions.map((q: any) => ({
          id: q.id,
          question: q.question,
          source_file: q.sourceFile,
          line_start: q.lineStart,
          line_end: q.lineEnd,
          expected_signals: safeJsonParse<string[]>(q.expectedSignals, []),
          red_flags: safeJsonParse<string[]>(q.redFlags, []),
          answer: q.answer,
          answer_score: q.answerScore,
          feedback: q.feedback,
          dimension_scores: safeJsonParse(q.dimensionScores, null),
        }))
      : [],
    interview_summary: {
      total: run.questions.length,
      answered: run.questions.filter((q: any) => q.answer).length,
      verified: run.verificationLevel === "repo_interview_verified",
    },
    validation_summary: validationSummary,
    authenticity: safeJsonParse(run.authenticitySignals, null),
    improvement_plan: safeJsonParse(run.improvementPlan, null),
    employer_verifier: safeJsonParse(run.employerVerifier, null),
    ai_collaboration: aiCollaboration,
    profile_summary: safeJsonParse(run.profileSummary, null),
    execution_mode: run.executionMode,
    terminal_summary: summarizeTerminalEvidence(terminalEvidence),
    terminal_evidence: isCandidateView ? terminalEvidence.map(sanitizeTerminalEvidence) : [],
    ownership_status: ownershipStatus,
    trust_labels: buildTrustLabels({
      executionMode: run.executionMode,
      verificationLevel: run.verificationLevel,
      scores,
      terminalEvidence,
      ownershipStatus,
      aiCollaboration,
      validationSummary,
      providerMatrix,
    }),
    mock_mode: run.executionMode === "mock" || run.scores.some((s: any) => ["mock", "heuristic"].includes(s.scoreSource)),
    created_at: run.createdAt,
    completed_at: run.completedAt,
  };
}

function summarizeAgentEvent(e: any) {
  const handoff = safeJsonParse<any>(e.output, null);
  const output = handoff?.output && typeof handoff.output === "object" ? handoff.output : {};
  const evidence = Array.isArray(handoff?.evidence) ? handoff.evidence : Array.isArray(output?.evidence) ? output.evidence : [];
  const completed = Array.isArray(handoff?.completed) ? handoff.completed : [];
  const unresolved = Array.isArray(handoff?.unresolved) ? handoff.unresolved : [];
  const issues = Array.isArray(handoff?.issues_found) ? handoff.issues_found : [];
  const findings = [
    ...completed,
    ...stringArray(output?.strengths),
    ...stringArray(output?.observations),
    ...stringArray(output?.positive_signals),
  ].slice(0, 5);

  return {
    agent: e.agentName,
    status: e.status,
    order: e.order,
    started_at: e.startedAt,
    completed_at: e.completedAt,
    duration_ms:
      e.startedAt && e.completedAt
        ? new Date(e.completedAt).getTime() - new Date(e.startedAt).getTime()
        : null,
    checked: agentCheckLabel(e.agentName),
    key_findings: findings,
    evidence_produced: evidence
      .filter((item: any) => typeof item?.reason === "string")
      .slice(0, 5)
      .map((item: any) => ({
        file: item.file ?? null,
        source: item.source ?? null,
        reason: item.reason,
      })),
    score_contribution: extractScoreContribution(output),
    missing_proof: [...unresolved, ...issues].slice(0, 5),
    next_action:
      handoff?.next_recommended
        ? `Next agent: ${handoff.next_recommended}`
        : unresolved.length || issues.length
          ? "Resolve missing proof before relying on this signal."
          : e.status === "completed"
            ? "Review the evidence linked to this check."
            : "Waiting for this check to finish.",
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function extractScoreContribution(output: Record<string, any>): { metric: string; score: number } | null {
  for (const [key, value] of Object.entries(output)) {
    if ((key.endsWith("_score") || key === "overall_score") && typeof value === "number") {
      return { metric: key, score: value };
    }
  }
  return null;
}

function agentCheckLabel(agent: string): string {
  const labels: Record<string, string> = {
    orchestrator: "Defined the validation contract and scoring plan.",
    "repo-scanner": "Mapped repository files, metadata, tests, and framework signals.",
    architecture: "Checked architecture, boundaries, and implementation structure.",
    "code-quality": "Checked maintainability, code clarity, and implementation quality.",
    testing: "Checked test coverage and test quality signals.",
    security: "Checked common security and secret-handling risks.",
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

function summarizeTerminalEvidence(rows: any[]) {
  const passed = rows.filter((t) => t.exitCode === 0).length;
  const failed = rows.filter((t) => t.exitCode !== null && t.exitCode !== undefined && t.exitCode !== 0).length;
  const skipped = rows.filter((t) => t.exitCode === null || t.statusLabel === "skipped").length;
  const byUse: Record<string, { passed: number; failed: number; skipped: number }> = {};
  for (const t of rows) {
    const key = String(t.usedFor ?? "agent");
    byUse[key] ??= { passed: 0, failed: 0, skipped: 0 };
    if (t.exitCode === 0) byUse[key].passed++;
    else if (t.exitCode === null || t.exitCode === undefined || t.statusLabel === "skipped") byUse[key].skipped++;
    else byUse[key].failed++;
  }
  return { total: rows.length, passed, failed, skipped, by_use: byUse };
}

function sanitizeTerminalEvidence(t: any) {
  return {
    commandRunId: t.commandRunId ?? null,
    command: String(t.command ?? ""),
    cwd: String(t.cwd ?? ""),
    exitCode: typeof t.exitCode === "number" ? t.exitCode : null,
    stdoutSummary: String(t.stdoutSummary ?? ""),
    stderrSummary: String(t.stderrSummary ?? ""),
    durationMs: Number(t.durationMs ?? 0),
    usedFor: t.usedFor ?? "agent",
    statusLabel: t.statusLabel ?? undefined,
    outputSha256: t.outputSha256 ?? null,
    redactionWarning: Boolean(t.redactionWarning),
    evidenceSource: t.evidenceSource ?? "sandbox_terminal",
    includeInReport: t.includeInReport !== false,
  };
}

function buildTrustLabels(input: {
  executionMode: string;
  verificationLevel: string;
  scores: Array<{ score: number | null; source: string; evidence: any[] }>;
  terminalEvidence: any[];
  ownershipStatus: any;
  aiCollaboration: any;
  validationSummary: any;
  providerMatrix: any;
}) {
  const labels: Array<{ label: string; tone: "default" | "good" | "warn" | "bad" | "accent" }> = [];
  const evidenceSources = new Set(input.scores.flatMap((s) => s.evidence.map((e: any) => e?.source).filter(Boolean)));
  const scoreSources = new Set(input.scores.map((s) => s.source));
  if (input.terminalEvidence.some((t) => t.exitCode === 0)) labels.push({ label: "Terminal verified", tone: "good" });
  if (evidenceSources.has("github_api")) labels.push({ label: "GitHub API verified", tone: "good" });
  if (evidenceSources.has("local_clone")) labels.push({ label: "Local clone verified", tone: "good" });
  if (scoreSources.has("llm")) labels.push({ label: "LLM judged", tone: "accent" });
  if (input.validationSummary || input.scores.some((s) => s.evidence.some((e: any) => e?.validator_note))) {
    labels.push({ label: "Validator audited", tone: "good" });
  }
  if (scoreSources.has("heuristic")) labels.push({ label: "Unverified legacy source", tone: "bad" });
  if (scoreSources.has("mock") || input.executionMode === "mock") labels.push({ label: "Unverified legacy source", tone: "bad" });
  if (input.verificationLevel === "repo_interview_verified") labels.push({ label: "Interview verified", tone: "good" });
  if (input.aiCollaboration) labels.push({ label: "Challenge verified", tone: "good" });
  if (input.ownershipStatus?.confidence === "verified") labels.push({ label: "Ownership verified", tone: "good" });
  else if (input.ownershipStatus?.confidence === "self_declared") labels.push({ label: "Self-declared", tone: "warn" });
  else labels.push({ label: "Ownership unverified", tone: "warn" });
  if (input.scores.some((s) => s.score == null)) labels.push({ label: "Not measured", tone: "default" });
  const agentEntries = Object.values(input.providerMatrix?.agents ?? {}) as any[];
  if (agentEntries.some((a) => a?.actualProvider && a.actualProvider !== a.provider)) {
    labels.push({ label: "Fallback used", tone: "warn" });
  }
  if (agentEntries.some((a) => a?.status === "skipped")) labels.push({ label: "Skipped", tone: "warn" });
  if (agentEntries.some((a) => a?.status === "planned")) labels.push({ label: "Pending approval", tone: "default" });
  return labels;
}
