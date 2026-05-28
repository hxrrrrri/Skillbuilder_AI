import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkillRadar } from "@/components/skill-radar";
import { EvidenceLocker } from "@/components/evidence-locker";
import { AuthenticityCard } from "@/components/authenticity-card";
import { RiskSignalsCard } from "@/components/risk-signals";
import { EmployerVerifier } from "@/components/employer-verifier";
import { ImprovementPlanCard } from "@/components/improvement-plan";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PublicProfile({ params }: { params: { slug: string } }) {
  const profile = await prisma.publicProfile.findUnique({
    where: { slug: params.slug },
    include: {
      candidate: true,
      run: {
        include: {
          candidate: true,
          repository: true,
          scores: true,
          questions: true,
        },
      },
    },
  });

  if (!profile) return notFound();

  const viewer = await getCurrentUser();
  const isOwner = !!viewer && !!profile.ownerUserId && profile.ownerUserId === viewer.id;
  const isAdminViewer = !!viewer && isAdminRole(viewer.role);
  if (profile.visibility === "private" && !isOwner && !isAdminViewer) {
    return notFound();
  }
  const previewMode = profile.visibility !== "public" && (isOwner || isAdminViewer);

  const run = profile.run;
  const candidate = run.candidate;

  const scores = run.scores.map((s) => ({
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

  const radarScores = scores
    .filter((s) => s.score != null && s.skill !== "Authenticity")
    .map((s) => ({ name: s.skill, score: s.score as number }));

  const authenticity = safeJsonParse<any>(run.authenticitySignals, null);
  const employer = safeJsonParse<any>(run.employerVerifier, null);
  const plan = safeJsonParse<any>(run.improvementPlan, null);
  const ai = safeJsonParse<any>(run.aiCollaboration, null);
  const ownership = safeJsonParse<any>(run.ownershipStatus, null);
  const showTerminalProof = profile.includeTerminalProof === true;
  const terminalEvidence = showTerminalProof
    ? safeJsonParse<any[]>(run.terminalEvidence, [])
    : ([] as any[]);
  const mode = run.executionMode ?? "api";
  const terminalSummary = (() => {
    let passed = 0;
    let failed = 0;
    const byUsedFor: Record<string, { p: number; f: number }> = {};
    for (const e of terminalEvidence) {
      const ok = e.exitCode === 0;
      if (ok) passed += 1;
      else if (e.exitCode !== null && e.exitCode !== undefined) failed += 1;
      if (!byUsedFor[e.usedFor]) byUsedFor[e.usedFor] = { p: 0, f: 0 };
      if (ok) byUsedFor[e.usedFor].p += 1;
      else if (e.exitCode !== null && e.exitCode !== undefined) byUsedFor[e.usedFor].f += 1;
    }
    return { total: terminalEvidence.length, passed, failed, byUsedFor };
  })();

  return (
    <div className="space-y-8">
      {previewMode && (
        <div className="rounded-lg border border-accent/50 bg-accent/10 px-4 py-3 text-xs text-ink">
          <span className="font-semibold text-accent">Preview mode.</span> This profile is{" "}
          <code className="rounded bg-panel2 px-1">{profile.visibility}</code> — only you (and admins) see this view.
        </div>
      )}
      <header className="rounded-lg border border-border bg-panel/88 p-8 shadow-glow">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">Verified Profile</Badge>
          <Badge tone={run.verificationLevel === "repo_interview_verified" ? "good" : "default"}>
            {run.verificationLevel === "repo_interview_verified" ? "Repo + Interview verified" : "Repo-only verified"}
          </Badge>
          <Badge tone="good">Validator audited</Badge>
          <Badge tone={mode === "mock" ? "bad" : "default"}>mode: {mode}</Badge>
          {ownership?.confidence === "verified" && <Badge tone="good">ownership: verified</Badge>}
          {ownership?.confidence === "self_declared" && <Badge tone="warn">ownership: self-declared</Badge>}
          {ownership?.confidence === "unverified" && <Badge tone="warn">ownership: unverified</Badge>}
          {terminalEvidence.length > 0 && (
            <Badge tone="good">Local proof · {terminalEvidence.length} cmds</Badge>
          )}
        </div>
        <h1 className="mt-3 text-3xl font-bold md:text-4xl">
          {candidate?.name ?? "Anonymous Candidate"}
        </h1>
        <div className="mt-2 text-sm text-muted">
          <span className="font-mono">{run.repository.owner}/{run.repository.repoName}</span>
          {candidate?.githubUsername && (
            <span className="ml-2 font-mono text-xs">· @{candidate.githubUsername}</span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Overall SkillProof</div>
            <div className="text-5xl font-bold">
              {run.overallScore ?? "—"}
              <span className="text-xl text-muted">/100</span>
            </div>
            <div className="text-sm text-muted">{run.roleFit}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{run.targetRole}</Badge>
            {run.candidateLevel && <Badge>{run.candidateLevel}</Badge>}
          </div>
        </div>
      </header>

      {radarScores.length > 0 && (
        <section className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Skill Graph</CardTitle>
            </CardHeader>
            <CardBody>
              <SkillRadar data={radarScores} />
            </CardBody>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Evidence Locker</CardTitle>
            </CardHeader>
            <CardBody>
              <EvidenceLocker scores={scores} />
            </CardBody>
          </Card>
        </section>
      )}

      {(terminalEvidence.length > 0 || ownership) && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Local Proof</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>execution mode: {mode}</Badge>
                {terminalEvidence.length > 0 && (
                  <>
                    <Badge tone="good">{terminalSummary.passed} passed</Badge>
                    {terminalSummary.failed > 0 && <Badge tone="warn">{terminalSummary.failed} failed</Badge>}
                    <Badge>{terminalEvidence.length} commands</Badge>
                  </>
                )}
              </div>

              {ownership && (
                <div>
                  <div className="text-xs uppercase text-muted">Ownership</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {ownership.owner_match && <Badge tone="good">GitHub owner verified via gh</Badge>}
                    {ownership.repo_token_verified && <Badge tone="good">Repo token verified</Badge>}
                    {ownership.self_declared && !ownership.owner_match && !ownership.repo_token_verified && (
                      <Badge tone="warn">Self-declared GitHub identity</Badge>
                    )}
                    {ownership.confidence === "unverified" && <Badge tone="warn">Anonymous</Badge>}
                  </div>
                  {Array.isArray(ownership.notes) && ownership.notes.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                      {ownership.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {terminalEvidence.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-muted">Terminal evidence summary</div>
                  <div className="mt-1 grid gap-2 md:grid-cols-4">
                    {Object.entries(terminalSummary.byUsedFor).map(([k, v]) => (
                      <div key={k} className="rounded border border-border p-2 text-xs">
                        <div className="font-mono text-muted">{k}</div>
                        <div className="mt-1">
                          <Badge tone={v.f === 0 ? "good" : "warn"}>{v.p} passed</Badge>
                          {v.f > 0 && <Badge tone="warn">{v.f} failed</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted">show commands</summary>
                    <ul className="mt-2 space-y-1 text-xs">
                      {terminalEvidence.slice(0, 30).map((t, i) => (
                        <li key={i} className="flex items-center gap-2 font-mono">
                          <Badge tone={t.exitCode === 0 ? "good" : t.exitCode === null ? "default" : "warn"}>
                            {t.exitCode === null ? "—" : `exit=${t.exitCode}`}
                          </Badge>
                          <span className="truncate">{t.command}</span>
                          <span className="text-muted">{t.usedFor}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </CardBody>
          </Card>
        </section>
      )}

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Risk signals</CardTitle>
          </CardHeader>
          <CardBody>
            <RiskSignalsCard
              authenticityRisks={authenticity?.risk_signals ?? []}
              ownershipStatus={ownership}
              aiCollaboration={ai}
            />
          </CardBody>
        </Card>
      </section>

      {authenticity && (
        <section>
          <Card>
            <CardHeader>
          <CardTitle>Authenticity Signals</CardTitle>
            </CardHeader>
            <CardBody>
              <AuthenticityCard data={authenticity} />
            </CardBody>
          </Card>
        </section>
      )}

      {run.questions.some((q) => q.answer) && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Interview Performance</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {run.questions
                .filter((q) => q.answer)
                .map((q) => {
                  const dim = safeJsonParse<any>(q.dimensionScores, null);
                  return (
                    <div key={q.id} className="rounded-lg border border-border bg-panel/70 p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-ink">{q.question}</div>
                        {q.answerScore != null && <Badge tone="good">{q.answerScore}/100</Badge>}
                      </div>
                      {q.sourceFile && (
                        <div className="mt-1 text-xs font-mono text-muted">↳ {q.sourceFile}</div>
                      )}
                      <p className="mt-2 text-sm text-muted">
                        Interview answer submitted and scored. Full answer text is private to the candidate.
                      </p>
                      {dim && (
                        <div className="mt-2 grid grid-cols-2 gap-1 text-xs md:grid-cols-5">
                          {Object.entries(dim).map(([k, v]) => (
                            <div key={k} className="rounded border border-border px-2 py-1 text-center">
                              <div className="text-muted">{k.replace(/_/g, " ")}</div>
                              <div className="font-semibold text-ink">{v as number}/100</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {q.feedback && (
                        <p className="mt-2 text-xs italic text-muted">Validator: {q.feedback}</p>
                      )}
                    </div>
                  );
                })}
            </CardBody>
          </Card>
        </section>
      )}

      {ai && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>AI Collaboration Challenge</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="good">Overall {ai.overall_score}/100</Badge>
                <Badge>{ai.tool_used}</Badge>
              </div>
              <p className="mt-2 text-sm italic text-muted">{ai.feedback}</p>
            </CardBody>
          </Card>
        </section>
      )}

      {employer && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Employer Verifier</CardTitle>
            </CardHeader>
            <CardBody>
              <EmployerVerifier data={employer} />
            </CardBody>
          </Card>
        </section>
      )}

      {plan && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Improvement Plan</CardTitle>
            </CardHeader>
            <CardBody>
              <ImprovementPlanCard data={plan} />
            </CardBody>
          </Card>
        </section>
      )}

      <footer className="text-center text-xs text-muted">
        Verified by SkillProof AI · {new Date(profile.createdAt).toLocaleDateString()} ·{" "}
        <a className="text-accent hover:underline" href={`/api/report/export?profile_id=${profile.id}`}>
          Download Report.md
        </a>
      </footer>
    </div>
  );
}
