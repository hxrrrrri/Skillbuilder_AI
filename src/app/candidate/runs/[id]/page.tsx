import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { evaluateRunAccess } from "@/lib/auth/guards-api";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EvidenceLocker } from "@/components/evidence-locker";
import { ImprovementPlanCard } from "@/components/improvement-plan";
import { AuthenticityCard } from "@/components/authenticity-card";
import { EmployerVerifier } from "@/components/employer-verifier";
import { CANDIDATE_NAV } from "../../_nav";
import { PublishRunButton } from "./publish-run-button";

export const dynamic = "force-dynamic";

export default async function CandidateRunDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/candidate/runs/${params.id}`);

  const run = await prisma.analysisRun.findUnique({
    where: { id: params.id },
    include: {
      candidate: true,
      repository: true,
      events: { orderBy: { order: "asc" } },
      scores: true,
      questions: true,
      profiles: true,
    },
  });
  if (!run) notFound();

  const decision = evaluateRunAccess(user, {
    candidateId: run.candidateId,
    createdByUserId: run.createdByUserId,
    tenantId: run.tenantId,
    candidateUserId: run.candidate?.userId ?? null,
  });
  if (!decision.ok || decision.reason === "tenant_member") {
    if (isAdminRole(user.role)) redirect(`/admin/runs/${run.id}`);
    notFound();
  }

  const scores = run.scores.map((s) => ({
    skill: s.skillName,
    score: s.score === -1 ? null : s.score,
    confidence: s.confidence,
    source: s.scoreSource,
    evidence: safeJsonParse<any[]>(s.evidence, []),
    validator_notes: s.validatorNotes,
  }));
  const ownership = safeJsonParse<any>(run.ownershipStatus, null);
  const terminal = safeJsonParse<any[]>(run.terminalEvidence, []);
  const authenticity = safeJsonParse<any>(run.authenticitySignals, null);
  const improvementPlan = safeJsonParse<any>(run.improvementPlan, null);
  const employerVerifier = safeJsonParse<any>(run.employerVerifier, null);
  const ai = safeJsonParse<any>(run.aiCollaboration, null);
  const completedCount = run.events.filter((e) => e.status === "completed").length;
  const publicProfile = run.profiles.find((p) => p.visibility === "public") ?? run.profiles[0] ?? null;
  const isMockLike =
    run.executionMode === "mock" || run.scores.some((s) => s.scoreSource === "mock" || s.scoreSource === "heuristic");

  return (
    <RoleShell
      title={`${run.repository.owner}/${run.repository.repoName}`}
      subtitle="Candidate-safe verification detail. Raw prompts, context packs, and provider internals are not shown here."
      navLinks={CANDIDATE_NAV}
      activeHref="/candidate/runs"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={run.status === "completed" ? "good" : run.status === "failed" ? "bad" : "warn"}>{run.status}</Badge>
        <Badge>{run.targetRole}</Badge>
        {run.candidateLevel && <Badge>{run.candidateLevel}</Badge>}
        <Badge tone={run.verificationLevel === "repo_interview_verified" ? "good" : "default"}>
          {run.verificationLevel.replace(/_/g, " ")}
        </Badge>
        {ownership?.confidence === "verified" && <Badge tone="good">Ownership verified</Badge>}
        {ownership?.confidence === "self_declared" && <Badge tone="warn">Self-declared ownership</Badge>}
        {!ownership && <Badge tone="default">Ownership not measured</Badge>}
        {terminal.some((t) => t.exitCode === 0) ? <Badge tone="good">Terminal verified</Badge> : <Badge>Terminal not measured</Badge>}
        {isMockLike && <Badge tone="warn">Mock / heuristic signals present</Badge>}
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-muted">Score</div>
            <div className="mt-1 text-4xl font-bold">
              {run.overallScore ?? "not measured"}
              {run.overallScore != null && <span className="text-xl text-muted">/100</span>}
            </div>
            <p className="mt-1 text-sm text-muted">{run.roleFit ?? "Waiting for validator summary."}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-muted">Mission progress</div>
            <div className="mt-1 text-3xl font-bold text-ink">
              {completedCount}/{run.events.length || 0}
            </div>
            <p className="mt-1 text-sm text-muted">Agents completed without exposing raw handoffs.</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-muted">Profile</div>
            {publicProfile ? (
              <>
                <div className="mt-1 text-lg font-semibold text-ink">{publicProfile.visibility}</div>
                <Link href={`/profile/${publicProfile.slug}`} className="text-sm text-accent hover:underline">
                  Open profile
                </Link>
              </>
            ) : run.status === "completed" ? (
              <div className="mt-3">
                <PublishRunButton runId={run.id} />
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted">Publish after the run completes.</p>
            )}
          </CardBody>
        </Card>
      </section>

      {run.status === "failed" && run.statusMessage && (
        <Card>
          <CardBody>
            <ScaffoldNotice title="Run failed" detail={run.statusMessage} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Agent trace</CardTitle>
        </CardHeader>
        <CardBody>
          {run.events.length === 0 ? (
            <ScaffoldNotice detail="No agent events have been recorded yet." />
          ) : (
            <ol className="grid gap-2 md:grid-cols-2">
              {run.events.map((event) => (
                <li key={event.id} className="rounded-md border border-border bg-panel2/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-xs text-ink">{event.agentName}</div>
                    <Badge tone={event.status === "completed" ? "good" : event.status === "failed" ? "bad" : "warn"}>
                      {event.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted">{candidateAgentSummary(event.agentName)}</p>
                  {event.notes && <p className="mt-1 text-xs text-muted">Finding: {event.notes}</p>}
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Evidence locker</CardTitle>
          </CardHeader>
          <CardBody>
            {scores.length === 0 ? (
              <ScaffoldNotice detail="No skill scores have been written yet." />
            ) : (
              <EvidenceLocker scores={scores} />
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ownership and warnings</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <TrustList executionMode={run.executionMode} scores={scores} ownership={ownership} terminal={terminal} />
            {ownership?.notes?.length ? (
              <ul className="list-disc pl-5 text-xs text-muted">
                {ownership.notes.map((note: string, i: number) => <li key={i}>{note}</li>)}
              </ul>
            ) : null}
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Proof Terminal Transcript</CardTitle>
          <Link href={`/candidate/runs/${run.id}/terminal`} className="text-xs text-accent hover:underline">
            Open sandbox terminal
          </Link>
        </CardHeader>
        <CardBody>
          {terminal.length === 0 ? (
            <ScaffoldNotice detail="No terminal proof has been saved yet. Run allowlisted commands from the sandbox terminal to add evidence." />
          ) : (
            <ul className="space-y-2">
              {terminal.map((t, i) => (
                <li key={i} className="rounded-md border border-border bg-panel2/40 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={t.exitCode === 0 ? "good" : t.exitCode === null ? "default" : "bad"}>
                      {t.exitCode === null ? t.statusLabel ?? "skipped" : `exit ${t.exitCode}`}
                    </Badge>
                    <Badge>{t.usedFor ?? "agent"}</Badge>
                    <code className="text-ink">{t.command}</code>
                    <span className="text-muted">{t.durationMs ?? 0}ms</span>
                    {t.outputSha256 && <span className="font-mono text-muted">sha256:{String(t.outputSha256).slice(0, 16)}</span>}
                    {t.redactionWarning && <Badge tone="warn">redacted</Badge>}
                  </div>
                  {(t.stdoutSummary || t.stderrSummary) && (
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-bg/60 p-2 text-[11px] text-muted">
                      {t.stdoutSummary}
                      {t.stderrSummary ? `\n${t.stderrSummary}` : ""}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Interview questions</CardTitle>
            <Link href={`/candidate/interview/${run.id}`} className="text-xs text-accent hover:underline">
              Answer interview
            </Link>
          </CardHeader>
          <CardBody>
            {run.questions.length === 0 ? (
              <ScaffoldNotice detail="No interview questions have been generated yet." />
            ) : (
              <ul className="space-y-3">
                {run.questions.map((q, i) => (
                  <li key={q.id} className="rounded-md border border-border bg-panel2/40 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-ink">Q{i + 1}. {q.question}</p>
                      {q.answerScore != null && <Badge tone="good">{q.answerScore}/100</Badge>}
                    </div>
                    {q.sourceFile && <p className="mt-1 font-mono text-xs text-muted">{q.sourceFile}</p>}
                    {q.answer ? (
                      <p className="mt-2 text-xs text-muted">Answered. {q.feedback ?? "Awaiting feedback."}</p>
                    ) : (
                      <p className="mt-2 text-xs text-muted">Not answered yet.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>AI collaboration challenge</CardTitle>
            <Link href={`/candidate/ai-challenge/${run.id}`} className="text-xs text-accent hover:underline">
              Open challenge
            </Link>
          </CardHeader>
          <CardBody>
            {ai ? (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="good">Overall {ai.overall_score}/100</Badge>
                  <Badge>{ai.tool_used ?? "tool not recorded"}</Badge>
                </div>
                <p className="text-muted">{ai.feedback}</p>
              </div>
            ) : (
              <ScaffoldNotice detail="Submit a small AI-collaboration challenge to prove review discipline, test awareness, and maturity." />
            )}
          </CardBody>
        </Card>
      </section>

      {authenticity && (
        <Card>
          <CardHeader>
            <CardTitle>Authenticity signals</CardTitle>
          </CardHeader>
          <CardBody>
            <AuthenticityCard data={authenticity} />
          </CardBody>
        </Card>
      )}

      {employerVerifier && (
        <Card>
          <CardHeader>
            <CardTitle>Employer verifier preview</CardTitle>
          </CardHeader>
          <CardBody>
            <EmployerVerifier data={employerVerifier} />
          </CardBody>
        </Card>
      )}

      {improvementPlan && (
        <Card>
          <CardHeader>
            <CardTitle>Improvement plan</CardTitle>
          </CardHeader>
          <CardBody>
            <ImprovementPlanCard data={improvementPlan} />
          </CardBody>
        </Card>
      )}
    </RoleShell>
  );
}

function candidateAgentSummary(agent: string) {
  const labels: Record<string, string> = {
    orchestrator: "Defined what evidence must be checked.",
    "repo-scanner": "Mapped files, tests, config, commits, and framework signals.",
    architecture: "Checked architecture and boundaries.",
    "code-quality": "Checked maintainability and implementation quality.",
    testing: "Checked test coverage and test quality.",
    security: "Checked security and secret-handling risks.",
    "git-evidence": "Checked commit and authorship signals.",
    documentation: "Checked README and documentation quality.",
    authenticity: "Checked ownership and authenticity risks.",
    "interview-gen": "Prepared own-code interview questions.",
    validator: "Audited claims against evidence and lowered unsupported scores.",
    "skill-graph": "Aggregated measured scores only.",
    "profile-gen": "Prepared profile and improvement plan summaries.",
  };
  return labels[agent] ?? `Checked ${agent.replace(/-/g, " ")}.`;
}

function TrustList({
  executionMode,
  scores,
  ownership,
  terminal,
}: {
  executionMode: string;
  scores: Array<{ score: number | null; source: string; evidence: any[] }>;
  ownership: any;
  terminal: any[];
}) {
  const sourceSet = new Set(scores.map((s) => s.source));
  const evidenceSet = new Set(scores.flatMap((s) => s.evidence.map((e) => e?.source).filter(Boolean)));
  return (
    <div className="flex flex-wrap gap-2">
      {terminal.some((t) => t.exitCode === 0) && <Badge tone="good">Terminal verified</Badge>}
      {evidenceSet.has("github_api") && <Badge tone="good">GitHub API verified</Badge>}
      {evidenceSet.has("local_clone") && <Badge tone="good">Local clone verified</Badge>}
      {sourceSet.has("llm") && <Badge tone="accent">LLM judged</Badge>}
      {sourceSet.has("heuristic") && <Badge tone="warn">Heuristic only</Badge>}
      {(sourceSet.has("mock") || executionMode === "mock") && <Badge tone="bad">Mock/demo</Badge>}
      {ownership?.confidence === "verified" && <Badge tone="good">Ownership verified</Badge>}
      {ownership?.confidence === "self_declared" && <Badge tone="warn">Self-declared</Badge>}
      {!ownership && <Badge>Not measured</Badge>}
      {scores.some((s) => s.score == null) && <Badge>Not measured</Badge>}
    </div>
  );
}
