"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentCard } from "@/components/agent-card";
import { EvidenceLocker } from "@/components/evidence-locker";
import { TokenMeter } from "@/components/token-meter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextArea } from "@/components/ui/input";
import { ContractCoverage } from "@/components/contract-coverage";
import { AuthenticityCard } from "@/components/authenticity-card";
import { EmployerVerifier } from "@/components/employer-verifier";
import { ImprovementPlanCard } from "@/components/improvement-plan";
import { AICollabChallenge } from "@/components/ai-collab-challenge";
import { MockBanner } from "@/components/mock-banner";
import { TerminalConsole } from "@/components/terminal-console";

type Run = any;

const SkillRadar = dynamic(
  () => import("@/components/skill-radar").then((mod) => mod.SkillRadar),
  { ssr: false }
);

export default function MissionPage({ params }: { params: { id: string } }) {
  const missionId = params.id;
  const [run, setRun] = useState<Run | null>(null);
  const [answer, setAnswer] = useState("");
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [verifyingOwner, setVerifyingOwner] = useState(false);

  useEffect(() => {
    let alive = true;
    async function tick() {
      const r = await fetch(`/api/runs/${missionId}`, { cache: "no-store" });
      if (!alive) return;
      if (r.ok) setRun(await r.json());
    }
    tick();
    const interval = setInterval(() => {
      if (run?.status === "completed" || run?.status === "failed") return;
      tick();
    }, 1500);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [missionId, run?.status]);

  if (!run) {
    return <div className="grid place-items-center py-20 text-muted">Loading mission…</div>;
  }

  const completedCount = run.events.filter((e: any) => e.status === "completed").length;
  const total = run.events.length;

  async function submitAnswer(qid: string) {
    setSubmitting(true);
    try {
      const r = await fetch("/api/interview/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: qid, answer }),
      });
      if (r.ok) {
        setAnswer("");
        setAnsweringId(null);
        const refresh = await fetch(`/api/runs/${missionId}`, { cache: "no-store" });
        if (refresh.ok) setRun(await refresh.json());
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      const r = await fetch("/api/profile/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: run!.id }),
      });
      if (r.ok) {
        const data = await r.json();
        setPublicUrl(data.url);
      }
    } finally {
      setPublishing(false);
    }
  }

  async function verifyOwnership() {
    setVerifyingOwner(true);
    try {
      const r = await fetch("/api/ownership/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: run!.id }),
      });
      if (r.ok) {
        const refresh = await fetch(`/api/runs/${params.id}`, { cache: "no-store" });
        if (refresh.ok) setRun(await refresh.json());
      }
    } finally {
      setVerifyingOwner(false);
    }
  }

  const scoresForRadar = (run.scores ?? [])
    .filter((s: any) => s.score != null && s.skill !== "Authenticity")
    .map((s: any) => ({ name: s.skill, score: s.score }));

  const contractAssertions = run.contract?.assertions ?? [];
  const importantFiles = run.context_pack?.filesIndex?.important ?? [];
  const repoIntel = run.repo_intelligence;

  return (
    <div className="space-y-8">
      <MockBanner active={!!run.mock_mode} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Mission</div>
          <h1 className="text-2xl font-bold">
            <span className="font-mono text-ink/90">
              {run.repo.owner}/{run.repo.name}
            </span>
          </h1>
          {run.candidate && (
            <div className="mt-1 text-sm text-muted">
              Candidate: <span className="text-ink">{run.candidate.name}</span>
              {run.candidate.github_username && (
                <span className="ml-2 font-mono text-xs">@{run.candidate.github_username}</span>
              )}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge>{run.target_role}</Badge>
            {run.candidate_level && <Badge>{run.candidate_level}</Badge>}
            <Badge tone={run.status === "completed" ? "good" : run.status === "failed" ? "bad" : "warn"}>
              {run.status}
            </Badge>
            <Badge tone="accent">{completedCount}/{total} agents</Badge>
            <Badge tone={run.verification_level === "repo_interview_verified" ? "good" : "default"}>
              {run.verification_level === "repo_interview_verified" ? "Repo + Interview verified" : "Repo-only verified"}
            </Badge>
            {run.execution_mode && (
              <Badge tone={run.execution_mode === "api" ? "default" : "accent"}>
                mode: {run.execution_mode}
              </Badge>
            )}
            {run.ownership_status?.owner_match && <Badge tone="good">owner verified (gh)</Badge>}
            {run.ownership_status?.repo_token_verified && <Badge tone="good">repo-token verified</Badge>}
            {run.ownership_status?.self_declared && !run.ownership_status?.owner_match && (
              <Badge tone="warn">self-declared</Badge>
            )}
            {run.ownership_status?.verification_token && (
              <Badge tone="accent">ownership token ready</Badge>
            )}
          </div>
          {run.ownership_status?.verification_token && (
            <div className="mt-2 rounded border border-border bg-panel2/70 p-2 text-xs text-muted">
              Verify GitHub ownership by adding this token temporarily to README or <span className="font-mono">.skillproof-verify.json</span>:{" "}
              <span className="font-mono text-ink">{run.ownership_status.verification_token}</span>
              <Button size="sm" variant="outline" className="ml-2" onClick={verifyOwnership} disabled={verifyingOwner}>
                {verifyingOwner ? "Checking..." : "Re-check ownership"}
              </Button>
            </div>
          )}
          {run.status === "failed" && run.status_message && (
            <div className="mt-2 max-w-2xl text-sm text-bad">Failure: {run.status_message}</div>
          )}
        </div>
        {run.status === "completed" && (
          <div className="flex items-center gap-2">
            <a href={`/api/report/export?run_id=${run.id}`}>
              <Button variant="outline">Export Report.md</Button>
            </a>
            {publicUrl ? (
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <Button variant="outline">Open public profile ↗</Button>
              </a>
            ) : (
              <Button onClick={publish} disabled={publishing}>
                {publishing ? "Publishing…" : "Publish public profile"}
              </Button>
            )}
          </div>
        )}
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <TokenMeter raw={run.tokens.raw} used={run.tokens.used} />
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-muted">Overall SkillProof</div>
            <div className="mt-1 text-4xl font-bold">
              {run.overall_score ?? "—"}
              <span className="text-xl text-muted">/100</span>
            </div>
            <div className="mt-1 text-sm text-muted">{run.role_fit ?? "Pending validator audit…"}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-muted">Pipeline</div>
            <div className="mt-1 font-semibold">Orchestrator → Workers → Validator</div>
            <p className="mt-2 text-sm text-muted">
              Serial execution with structured handoffs. Fresh-context validator audits every score
              against the repo file truth set before the graph is built.
            </p>
          </CardBody>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Mission Control</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid gap-3 md:grid-cols-3">
              {run.events.map((e: any) => (
                <AgentCard key={e.agent} agent={e.agent} status={e.status} notes={e.notes} />
              ))}
            </div>
            {run.provider_matrix && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wide text-muted">Provider matrix</div>
                <div className="mt-1 grid gap-2 md:grid-cols-5">
                  {Object.entries(run.provider_matrix)
                    .filter(([role]) => role !== "agents")
                    .map(([role, prov]) => (
                    <div key={role} className="rounded border border-border bg-panel2 p-2 text-xs">
                      <div className="text-muted">{role}</div>
                      <div className="font-mono text-ink">{String(prov)}</div>
                    </div>
                  ))}
                </div>
                {run.provider_matrix.agents && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-muted">per-agent runtime config</summary>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      {Object.entries(run.provider_matrix.agents).map(([agent, cfg]: any) => (
                        <div key={agent} className="rounded border border-border bg-panel2/70 p-2">
                          <div className="font-mono text-muted">{agent}</div>
                          <div className="mt-1 font-mono text-ink">{cfg.actualProvider ?? cfg.provider}</div>
                          <div className="text-muted">{cfg.actualModel ?? cfg.model} · reasoning {cfg.reasoningBudget}</div>
                          {cfg.status && <Badge tone={cfg.status === "skipped" ? "warn" : "default"}>{cfg.status}</Badge>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              {["install", "testing", "build", "typecheck", "lint"].map((kind) => {
                const rows = (run.terminal_evidence ?? []).filter((t: any) => t.usedFor === kind);
                const passed = rows.some((t: any) => t.exitCode === 0);
                const failed = rows.some((t: any) => t.exitCode !== null && t.exitCode !== 0);
                const pending = rows.some((t: any) => t.statusLabel === "install_pending_approval");
                const skipped = rows.some((t: any) => t.statusLabel === "skipped" || t.exitCode === null);
                const tone = passed ? "good" : failed ? "bad" : pending || skipped ? "warn" : "default";
                const label = passed ? "passed" : failed ? "failed" : pending ? "pending approval" : skipped ? "skipped" : "not measured";
                return (
                  <div key={kind} className="rounded border border-border bg-panel2 p-2 text-xs">
                    <div className="font-mono text-muted">{kind}</div>
                    <Badge tone={tone as any} className="mt-1">{label}</Badge>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </section>

      {repoIntel && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Repo Map</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="grid gap-3 md:grid-cols-5">
                {[
                  ["files", repoIntel.files?.length ?? 0],
                  ["routes", repoIntel.routes?.length ?? 0],
                  ["components", repoIntel.components?.length ?? 0],
                  ["tests", repoIntel.testFiles?.length ?? 0],
                  ["configs", repoIntel.configFiles?.length ?? 0],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded border border-border bg-panel2/70 p-3">
                    <div className="text-xs uppercase text-muted">{label}</div>
                    <div className="mt-1 text-2xl font-semibold text-ink">{value as number}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(repoIntel.frameworks ?? []).map((f: string) => <Badge key={f}>{f}</Badge>)}
                {(repoIntel.packageManagers ?? []).map((pm: string) => <Badge key={pm}>pm:{pm}</Badge>)}
                {(repoIntel.riskFlags ?? []).slice(0, 3).map((r: any, i: number) => <Badge key={i} tone="warn">{r.severity}: {r.reason}</Badge>)}
              </div>
            </CardBody>
          </Card>
        </section>
      )}

      {(run.terminal_evidence?.length ?? 0) > 0 && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Terminal Evidence</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="text-xs text-muted">
                Real commands run on the candidate&apos;s machine. Token patterns redacted before persistence.
              </div>
              {run.terminal_evidence.map((t: any, i: number) => (
                <details key={i} className="rounded border border-border bg-panel2 p-2 text-xs">
                  <summary className="cursor-pointer flex flex-wrap items-center gap-2">
                    <Badge tone={t.exitCode === 0 ? "good" : t.exitCode === null ? "warn" : "bad"}>{t.exitCode === null ? (t.statusLabel ?? "skipped") : `exit ${t.exitCode}`}</Badge>
                    <Badge>{t.usedFor}</Badge>
                    <span className="font-mono text-ink">{t.command}</span>
                    <span className="ml-auto text-muted">{t.durationMs}ms</span>
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-bg/80 p-2 text-[11px] leading-relaxed">
                    {t.stdoutSummary}
                    {t.stderrSummary && <span className="text-bad">{"\n" + t.stderrSummary}</span>}
                  </pre>
                </details>
              ))}
            </CardBody>
          </Card>
        </section>
      )}

      {run.execution_mode && run.execution_mode !== "api" && run.execution_mode !== "mock" && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Run a command</CardTitle>
            </CardHeader>
            <CardBody>
              <TerminalConsole missionId={run.id} enableSaveAsEvidence defaultCommand="git log --oneline -n 20" />
            </CardBody>
          </Card>
        </section>
      )}

      {contractAssertions.length > 0 && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Validation Contract Coverage</CardTitle>
            </CardHeader>
            <CardBody>
              <ContractCoverage
                assertions={contractAssertions}
                coverage={run.validation_coverage ?? []}
              />
            </CardBody>
          </Card>
        </section>
      )}

      {scoresForRadar.length > 0 && (
        <section className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Skill Graph</CardTitle>
            </CardHeader>
            <CardBody>
              <SkillRadar data={scoresForRadar} />
            </CardBody>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Evidence Locker</CardTitle>
            </CardHeader>
            <CardBody>
              <EvidenceLocker scores={run.scores ?? []} />
            </CardBody>
          </Card>
        </section>
      )}

      {run.authenticity && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Authenticity Signals</CardTitle>
            </CardHeader>
            <CardBody>
              <AuthenticityCard data={run.authenticity} />
            </CardBody>
          </Card>
        </section>
      )}

      {run.questions?.length > 0 && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Code-Based Interview</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {run.questions.map((q: any, i: number) => (
                <div key={q.id} className="rounded-lg border border-border bg-panel/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium text-ink">Q{i + 1}. {q.question}</div>
                    {q.answer_score != null && <Badge tone="good">{q.answer_score}/100</Badge>}
                  </div>
                  {q.source_file && (
                    <div className="mt-1 text-xs font-mono text-muted">
                      ↳ {q.source_file}{q.line_start ? `:${q.line_start}${q.line_end && q.line_end !== q.line_start ? `-${q.line_end}` : ""}` : ""}
                    </div>
                  )}
                  {q.answer ? (
                    <>
                      <p className="mt-3 text-sm text-ink/80">{q.answer}</p>
                      {q.dimension_scores && (
                        <div className="mt-2 grid grid-cols-2 gap-1 text-xs md:grid-cols-5">
                          {Object.entries(q.dimension_scores).map(([k, v]) => (
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
                      <details className="mt-2 text-xs text-muted">
                        <summary className="cursor-pointer text-accent">Expected signals and red flags</summary>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="uppercase tracking-wide">Expected signals</div>
                            <ul className="mt-1 list-disc pl-5">
                              {(q.expected_signals ?? []).map((s: string) => <li key={s}>{s}</li>)}
                            </ul>
                          </div>
                          <div>
                            <div className="uppercase tracking-wide">Red flags</div>
                            <ul className="mt-1 list-disc pl-5">
                              {(q.red_flags ?? []).map((s: string) => <li key={s}>{s}</li>)}
                            </ul>
                          </div>
                        </div>
                      </details>
                    </>
                  ) : answeringId === q.id ? (
                    <div className="mt-3 space-y-2">
                      <TextArea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Type your answer…"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => submitAnswer(q.id)} disabled={submitting}>
                          {submitting ? "Scoring…" : "Submit"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAnsweringId(null);
                            setAnswer("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => setAnsweringId(q.id)}
                    >
                      Answer this question
                    </Button>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        </section>
      )}

      {run.status === "completed" && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>AI Collaboration Challenge</CardTitle>
            </CardHeader>
            <CardBody>
              <AICollabChallenge
                runId={run.id}
                importantFiles={importantFiles}
                existing={run.ai_collaboration}
                onUpdated={async () => {
                  const refresh = await fetch(`/api/runs/${missionId}`, { cache: "no-store" });
                  if (refresh.ok) setRun(await refresh.json());
                }}
              />
            </CardBody>
          </Card>
        </section>
      )}

      {run.employer_verifier && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Employer Verifier Preview</CardTitle>
            </CardHeader>
            <CardBody>
              <EmployerVerifier data={run.employer_verifier} />
            </CardBody>
          </Card>
        </section>
      )}

      {run.improvement_plan && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Improvement Plan</CardTitle>
            </CardHeader>
            <CardBody>
              <ImprovementPlanCard data={run.improvement_plan} />
            </CardBody>
          </Card>
        </section>
      )}
    </div>
  );
}
