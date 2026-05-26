"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentCard } from "@/components/agent-card";
import { SkillRadar } from "@/components/skill-radar";
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

type Run = any;

export default function MissionPage() {
  const params = useParams<{ id: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [answer, setAnswer] = useState("");
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      const r = await fetch(`/api/runs/${params.id}`, { cache: "no-store" });
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
  }, [params.id, run?.status]);

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
        const refresh = await fetch(`/api/runs/${params.id}`, { cache: "no-store" });
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

  const scoresForRadar = (run.scores ?? [])
    .filter((s: any) => s.score != null && s.skill !== "Authenticity")
    .map((s: any) => ({ name: s.skill, score: s.score }));

  const contractAssertions = run.contract?.assertions ?? [];
  const importantFiles = run.context_pack?.filesIndex?.important ?? [];

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
          </div>
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
          </CardBody>
        </Card>
      </section>

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
                    <div className="mt-1 text-xs font-mono text-muted">↳ {q.source_file}</div>
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
                  const refresh = await fetch(`/api/runs/${params.id}`, { cache: "no-store" });
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
