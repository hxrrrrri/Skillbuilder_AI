"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentCard } from "@/components/agent-card";
import { SkillRadar } from "@/components/skill-radar";
import { EvidencePanel } from "@/components/evidence-panel";
import { TokenMeter } from "@/components/token-meter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextArea } from "@/components/ui/input";

type Run = {
  id: string;
  status: string;
  overall_score: number | null;
  role_fit: string | null;
  target_role: string;
  candidate_level: string;
  tokens: { raw: number; used: number };
  repo: { url: string; name: string; owner: string };
  events: Array<{
    agent: string;
    status: "pending" | "running" | "completed" | "failed";
    order: number;
    notes: string | null;
  }>;
  scores: Array<{ skill: string; score: number; confidence: number; evidence: any[] }>;
  questions: Array<{
    id: string;
    question: string;
    source_file: string | null;
    expected_signals: string[];
    answer: string | null;
    answer_score: number | null;
    feedback: string | null;
  }>;
};

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
    return (
      <div className="grid place-items-center py-20 text-muted">Loading mission…</div>
    );
  }

  const completedCount = run.events.filter((e) => e.status === "completed").length;
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

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Mission</div>
          <h1 className="text-2xl font-bold">
            <span className="font-mono text-ink/90">
              {run.repo.owner}/{run.repo.name}
            </span>
          </h1>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <Badge>{run.target_role}</Badge>
            <Badge>{run.candidate_level}</Badge>
            <Badge tone={run.status === "completed" ? "good" : run.status === "failed" ? "bad" : "warn"}>
              {run.status}
            </Badge>
            <Badge tone="accent">
              {completedCount}/{total} agents
            </Badge>
          </div>
        </div>
        {run.status === "completed" && (
          <div className="flex items-center gap-2">
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
              Serial execution with structured handoffs. A fresh-context validator audits every score
              before the skill graph is built.
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
              {run.events.map((e) => (
                <AgentCard key={e.agent} agent={e.agent} status={e.status} notes={e.notes} />
              ))}
            </div>
          </CardBody>
        </Card>
      </section>

      {run.scores.length > 0 && (
        <section className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Skill Graph</CardTitle>
            </CardHeader>
            <CardBody>
              <SkillRadar data={run.scores.map((s) => ({ name: s.skill, score: s.score }))} />
            </CardBody>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Evidence</CardTitle>
            </CardHeader>
            <CardBody>
              <EvidencePanel scores={run.scores} />
            </CardBody>
          </Card>
        </section>
      )}

      {run.questions.length > 0 && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Code-Based Interview</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {run.questions.map((q, i) => (
                <div key={q.id} className="rounded-lg border border-border bg-panel/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium text-ink">
                      Q{i + 1}. {q.question}
                    </div>
                    {q.answer_score != null && <Badge tone="good">{q.answer_score}/100</Badge>}
                  </div>
                  {q.source_file && (
                    <div className="mt-1 text-xs font-mono text-muted">↳ {q.source_file}</div>
                  )}
                  {q.answer ? (
                    <>
                      <p className="mt-3 text-sm text-ink/80">{q.answer}</p>
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
    </div>
  );
}
