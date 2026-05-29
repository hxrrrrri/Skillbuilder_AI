"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PublishRunButton } from "./publish-run-button";

type StageStatus = "pending" | "running" | "in_progress" | "completed" | "failed" | "skipped";

type RunPayload = {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | string;
  status_message: string | null;
  overall_score: number | null;
  role_fit: string | null;
  verification_level: string;
  target_role: string;
  candidate_level: string | null;
  repo: { owner: string; name: string; url: string };
  progress: { completed: number; total: number };
  events: Array<{
    agent: string;
    status: StageStatus;
    order: number;
    started_at: string | null;
    completed_at: string | null;
    duration_ms: number | null;
    checked: string;
    key_findings: string[];
    evidence_produced: Array<{ file?: string | null; source?: string | null; reason: string }>;
    score_contribution: { metric: string; score: number } | null;
    missing_proof: string[];
    next_action: string;
  }>;
  skill_runs: Array<{
    id: string;
    skill_id: string;
    skill_version: string;
    status: string;
    started_at: string | null;
    ended_at: string | null;
    duration_ms: number | null;
    evidence_ids: string[];
    candidate_summary?: string | null;
  }>;
  evidence_findings: Array<{
    id: string;
    category: string;
    claim: string;
    evidence_type: string;
    file_path: string | null;
    line_start: number | null;
    line_end: number | null;
    confidence: number;
    severity: string | null;
    redacted_text: string;
  }>;
  harness_snapshot: any | null;
  scores: Array<{
    skill: string;
    score: number | null;
    confidence: number;
    source: string;
    evidence: Array<any>;
    validator_notes?: string | null;
  }>;
  questions: Array<{
    id: string;
    question: string;
    source_file: string | null;
    line_start?: number | null;
    line_end?: number | null;
    answer?: string | null;
    answer_score?: number | null;
    feedback?: string | null;
  }>;
  interview_summary: { total: number; answered: number; verified: boolean };
  validation_summary: any | null;
  validation_contract: any | null;
  validation_coverage: any[];
  repo_intelligence: any | null;
  authenticity: any | null;
  improvement_plan: any | null;
  employer_verifier: any | null;
  ai_collaboration: any | null;
  profile_summary: any | null;
  execution_mode: string;
  provider_matrix: any | null;
  processing_mode: "worker" | "in_process";
  worker_status: {
    state: "unclaimed" | "queued_retry" | "active" | "stale" | "failed" | "completed" | "unknown";
    worker_id: string | null;
    heartbeat_at: string | null;
    heartbeat_age_ms: number | null;
    attempt_count: number;
    max_attempts: number;
    detail: string;
  } | null;
  terminal_summary: { total: number; passed: number; failed: number; skipped: number; by_use: Record<string, any> };
  terminal_evidence: Array<any>;
  ownership_status: any | null;
  trust_labels: Array<{ label: string; tone: "default" | "good" | "warn" | "bad" | "accent" }>;
  mock_mode: boolean;
  created_at: string;
  completed_at: string | null;
};

const STAGES: Array<{ key: string; label: string; agent?: string }> = [
  { key: "queued", label: "queued" },
  { key: "provider", label: "provider readiness checked" },
  { key: "contract", label: "validation contract generating", agent: "orchestrator" },
  { key: "repo", label: "repo scanning", agent: "repo-scanner" },
  { key: "architecture", label: "architecture review", agent: "architecture" },
  { key: "quality", label: "code quality review", agent: "code-quality" },
  { key: "testing", label: "testing review", agent: "testing" },
  { key: "security", label: "security review", agent: "security" },
  { key: "ai-collaboration", label: "AI collaboration review", agent: "ai-collaboration" },
  { key: "git", label: "git evidence review", agent: "git-evidence" },
  { key: "docs", label: "documentation review", agent: "documentation" },
  { key: "authenticity", label: "authenticity review", agent: "authenticity" },
  { key: "interview", label: "interview generation", agent: "interview-gen" },
  { key: "validation", label: "validation", agent: "validator" },
  { key: "graph", label: "skill graph generation", agent: "skill-graph" },
  { key: "profile", label: "profile/report generation", agent: "profile-gen" },
  { key: "completed", label: "completed" },
];

function statusTone(status: string) {
  if (status === "completed") return "good" as const;
  if (status === "failed") return "bad" as const;
  if (status === "running" || status === "in_progress") return "warn" as const;
  return "default" as const;
}

function agentEvent(run: RunPayload | null, agent?: string) {
  if (!run || !agent) return null;
  return run.events.find((e) => e.agent === agent) ?? null;
}

function stageStatus(run: RunPayload | null, stage: { key: string; agent?: string }): StageStatus {
  if (!run) return "pending";
  if (stage.key === "queued") {
    if (run.status === "pending") return "running";
    return run.status === "failed" ? "completed" : "completed";
  }
  if (stage.key === "provider") {
    if (run.status === "pending") return "completed";
    return run.provider_matrix || run.status !== "pending" ? "completed" : "running";
  }
  if (stage.key === "completed") {
    if (run.status === "completed") return "completed";
    if (run.status === "failed") return "failed";
    return "pending";
  }
  const ev = agentEvent(run, stage.agent);
  if (!ev) return "pending";
  return ev.status;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "not captured";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function RunCommandCenter({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const runRef = useRef<RunPayload | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "run_load_failed");
        return;
      }
      runRef.current = data;
      setRun(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "run_load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      const current = runRef.current;
      const shouldPoll =
        !current ||
        current.status === "pending" ||
        current.status === "running" ||
        current.status === "in_progress";
      if (shouldPoll) void load();
    }, 2500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const isActive = run?.status === "pending" || run?.status === "running" || run?.status === "in_progress" || (loading && !run);
  const completedAgentCount = run?.events.filter((e) => e.status === "completed").length ?? 0;
  const totalAgentCount = run?.events.length ?? STAGES.filter((s) => s.agent).length;
  const progressPercent = totalAgentCount ? Math.round((completedAgentCount / totalAgentCount) * 100) : 0;
  const failedEvent = run?.events.find((e) => e.status === "failed");
  const terminalTotal = run?.terminal_summary?.total ?? 0;
  const terminalLoading = isActive && (!run || (run.execution_mode !== "api" && terminalTotal === 0));
  const terminalReady = !!run && (run.execution_mode === "api" || !isActive || terminalTotal > 0);

  return (
    <div className="space-y-4">
      {error && (
        <Card>
          <CardBody>
            <StateNotice tone="bad" title="Run could not be loaded" detail={error} />
          </CardBody>
        </Card>
      )}

      {run?.processing_mode === "in_process" && run.status !== "completed" && (
        <Card className="border-warn/35 bg-warn/5">
          <CardBody>
            <StateNotice
              tone="warn"
              title="Local in-process fallback"
              detail="This run is being processed by the web process. For demo and production, set SKILLPROOF_WORKER_MODE=1 and run `npm run worker`."
            />
          </CardBody>
        </Card>
      )}

      {run?.processing_mode === "worker" && run.status !== "completed" && run.worker_status && run.worker_status.state !== "active" && (
        <Card className={cn(run.worker_status.state === "stale" || run.worker_status.state === "failed" ? "border-bad/35 bg-bad/5" : "border-warn/35 bg-warn/5")}>
          <CardBody>
            <StateNotice
              tone={run.worker_status.state === "stale" || run.worker_status.state === "failed" ? "bad" : "warn"}
              title={workerStatusTitle(run.worker_status.state)}
              detail={`${run.worker_status.detail} Attempts ${run.worker_status.attempt_count}/${run.worker_status.max_attempts}.`}
            />
          </CardBody>
        </Card>
      )}

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(run?.status ?? "pending")}>{run?.status ?? "loading"}</Badge>
              {run?.target_role && <Badge>{run.target_role}</Badge>}
              {run?.candidate_level && <Badge>{run.candidate_level}</Badge>}
              {run?.verification_level && <Badge tone={run.verification_level === "repo_interview_verified" ? "good" : "default"}>{run.verification_level.replace(/_/g, " ")}</Badge>}
              {run?.ownership_status?.confidence === "verified" && <Badge tone="good">Ownership verified</Badge>}
              {run?.ownership_status?.confidence === "self_declared" && <Badge tone="warn">Self-declared ownership</Badge>}
              {run?.terminal_summary?.passed ? <Badge tone="good">Terminal proof included</Badge> : <Badge>Terminal not measured</Badge>}
              {run?.mock_mode && <Badge tone="bad">Unverified score source</Badge>}
            </div>
            {run?.trust_labels?.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {run.trust_labels.map((label) => (
                  <Badge key={label.label} tone={label.tone}>{label.label}</Badge>
                ))}
              </div>
            ) : null}
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Metric label="Overall score" value={run?.overall_score == null ? "not measured" : `${run.overall_score}/100`} detail={run?.role_fit ?? "Waiting for validator summary."} />
              <Metric label="Agent progress" value={`${completedAgentCount}/${totalAgentCount}`} detail={`${progressPercent}% based on completed agent events`} />
              <Metric label="Execution mode" value={run?.execution_mode ?? "loading"} detail={run?.status_message ?? "Preparing mission state."} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mission progress</CardTitle>
          </CardHeader>
          <CardBody>
            <MissionProgress run={run} />
          </CardBody>
        </Card>
      </section>

      {run?.status === "failed" && (
        <Card className="border-bad/35 bg-bad/5">
          <CardBody>
            <StateNotice
              tone="bad"
              title={failedEvent ? `Failed at ${failedEvent.agent}` : "Run failed"}
              detail={run.status_message || failedEvent?.next_action || "The mission failed without a recorded reason."}
            />
          </CardBody>
        </Card>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <ReportSection
          title="Provider readiness"
          loading={isActive && !run?.provider_matrix}
          loadingText="Loading provider matrix..."
          ready={!!run?.provider_matrix}
          emptyText="Provider matrix not stored yet."
        >
          <ProviderMatrix matrix={run?.provider_matrix} />
        </ReportSection>

        <ReportSection
          title="Validation Contract"
          loading={isActive && !run?.validation_contract}
          loadingText="Generating validation contract..."
          ready={!!run?.validation_contract}
          emptyText="No validation contract generated yet."
        >
          <ValidationContract contract={run?.validation_contract} summary={run?.validation_summary} />
        </ReportSection>

        <ReportSection
          title="Repo Intelligence"
          loading={isActive && !run?.repo_intelligence}
          loadingText="Scanning repository tree, routes, configs, tests, and risk flags..."
          ready={!!run?.repo_intelligence}
          emptyText="No repository intelligence generated yet."
        >
          <RepoIntelligence data={run?.repo_intelligence} />
        </ReportSection>

        <ReportSection
          title="Agent Timeline"
          loading={isActive && (!run || run.events.length === 0)}
          loadingText="Waiting for agent events..."
          ready={!!run?.events.length}
          emptyText="No agent events generated yet."
        >
          <AgentTimeline events={run?.events ?? []} partial={run?.status === "running" || run?.status === "in_progress"} />
        </ReportSection>

        <ReportSection
          title="Evidence Locker"
          loading={isActive && !run?.evidence_findings.length && !run?.scores.length}
          loadingText="Collecting file-backed evidence..."
          ready={!!run?.evidence_findings.length || !!run?.scores.length}
          emptyText="No evidence generated yet."
        >
          <EvidenceLocker run={run} />
        </ReportSection>

        <ReportSection
          title="Skill Graph"
          loading={isActive && !run?.scores.length}
          loadingText="Aggregating measured dimensions only..."
          ready={!!run?.scores.length}
          emptyText="No skill scores generated yet."
        >
          <SkillGraph scores={run?.scores ?? []} />
        </ReportSection>

        <ReportSection
          title="Terminal Proof"
          loading={terminalLoading}
          loadingText="Waiting for sandbox policy and terminal proof..."
          ready={terminalReady}
          emptyText="No terminal proof saved yet."
        >
          <TerminalProof run={run} />
        </ReportSection>

        <ReportSection
          title="Interview Questions"
          loading={isActive && !run?.questions.length}
          loadingText="Generating own-code interview questions..."
          ready={!!run?.questions.length}
          emptyText="No interview questions generated yet."
        >
          <InterviewQuestions run={run} />
        </ReportSection>

        <ReportSection
          title="Public Profile / Report Preview"
          loading={isActive && !run?.profile_summary}
          loadingText="Preparing employer-safe report preview..."
          ready={!!run?.profile_summary || run?.status === "completed"}
          emptyText="No public-safe profile preview generated yet."
          className="xl:col-span-2"
        >
          <ProfilePreview run={run} />
        </ReportSection>
      </section>
    </div>
  );
}

function MissionProgress({ run }: { run: RunPayload | null }) {
  return (
    <ol className="space-y-2">
      {STAGES.map((stage) => {
        const status = stageStatus(run, stage);
        const ev = agentEvent(run, stage.agent);
        return (
          <li key={stage.key} className="flex gap-3 rounded-xl border border-border bg-panel2/35 p-2.5">
            <span className={cn("dot mt-1", status === "completed" ? "dot-completed" : status === "running" || status === "in_progress" ? "dot-running" : status === "failed" ? "dot-failed" : status === "skipped" ? "dot-skipped" : "dot-pending")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-ink">{stage.label}</span>
                <span className="font-mono text-[10px] uppercase text-muted">{status}</span>
              </div>
              {ev?.checked && <p className="mt-1 text-xs text-muted">{ev.checked}</p>}
              {(status === "running" || status === "in_progress") && <p className="mt-1 font-mono text-[11px] text-warn">running provider-backed check...</p>}
              {status === "failed" && <p className="mt-1 text-xs text-bad">{ev?.next_action || "Check failure details below."}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ReportSection({
  title,
  loading,
  loadingText,
  ready,
  emptyText,
  children,
  className,
}: {
  title: string;
  loading: boolean;
  loadingText: string;
  ready: boolean;
  emptyText: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {ready ? children : loading ? <SectionSkeleton text={loadingText} /> : <StateNotice title="Empty" detail={emptyText} />}
      </CardBody>
    </Card>
  );
}

function SectionSkeleton({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 font-mono text-xs text-muted">
        <span className="dot dot-running" />
        {text}
      </div>
      <div className="skeleton-shimmer h-10 rounded-xl" />
      <div className="skeleton-shimmer h-24 rounded-xl" />
      <div className="grid gap-2 md:grid-cols-3">
        <div className="skeleton-shimmer h-16 rounded-xl" />
        <div className="skeleton-shimmer h-16 rounded-xl" />
        <div className="skeleton-shimmer h-16 rounded-xl" />
      </div>
    </div>
  );
}

function ProviderMatrix({ matrix }: { matrix: any }) {
  if (!matrix) return null;
  const agents = Object.entries(matrix.agents ?? {}) as Array<[string, any]>;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-5">
        {["orchestrator", "worker", "validator", "interview", "profile"].map((role) => (
          <div key={role} className="rounded-xl border border-border bg-panel2/35 p-3">
            <div className="text-xs uppercase text-muted">{role}</div>
            <div className="mt-1 font-mono text-xs text-ink">{matrix[role] ?? "not set"}</div>
          </div>
        ))}
      </div>
      <div className="max-h-72 overflow-auto rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-panel2 text-muted">
            <tr>
              <th className="p-2">Agent</th>
              <th className="p-2">Provider</th>
              <th className="p-2">Model</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(([agent, entry]) => (
              <tr key={agent} className="border-t border-border">
                <td className="p-2 font-mono text-ink">{agent}</td>
                <td className="p-2 text-muted">{entry.actualProvider ?? entry.provider}</td>
                <td className="p-2 text-muted">{entry.actualModel ?? entry.model}</td>
                <td className="p-2"><Badge tone={statusTone(entry.status ?? "pending")}>{entry.status ?? "planned"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValidationContract({ contract, summary }: { contract: any; summary: any }) {
  const assertions = Array.isArray(contract?.assertions) ? contract.assertions : [];
  return (
    <div className="space-y-3">
      {summary && (
        <div className="grid gap-2 md:grid-cols-5">
          {["passed", "partial", "failed", "unknown", "evidence_coverage_percentage"].map((k) => (
            <Metric key={k} label={k.replace(/_/g, " ")} value={String(summary[k] ?? 0)} />
          ))}
        </div>
      )}
      <ul className="space-y-2">
        {assertions.slice(0, 8).map((a: any) => (
          <li key={a.id} className="rounded-xl border border-border bg-panel2/35 p-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>{a.id}</Badge>
              <Badge>{a.dimension}</Badge>
              <Badge>{a.detector}</Badge>
              <span className="font-mono text-xs text-muted">w={a.weight}</span>
            </div>
            <p className="mt-2 text-ink">{a.statement}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RepoIntelligence({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-4">
        <Metric label="Files" value={String(data.files?.length ?? 0)} />
        <Metric label="Routes" value={String(data.routes?.length ?? 0)} />
        <Metric label="Components" value={String(data.components?.length ?? 0)} />
        <Metric label="Tests" value={String(data.testFiles?.length ?? 0)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <MiniList title="Frameworks" items={data.frameworks ?? []} />
        <MiniList title="Package managers" items={data.packageManagers ?? []} />
        <MiniList title="Routes / APIs" items={(data.routes ?? []).slice(0, 8).map((r: any) => `${r.route} -> ${r.file}`)} />
        <MiniList title="Risk flags" items={(data.riskFlags ?? []).slice(0, 8).map((r: any) => `${r.severity}: ${r.reason}${r.file ? ` (${r.file})` : ""}`)} empty="No deterministic risk flags yet." />
      </div>
    </div>
  );
}

const AGENT_META: Record<string, { title: string; subtitle: string }> = {
  orchestrator: { title: "Orchestrator", subtitle: "Writes validation contract" },
  "repo-scanner": { title: "Repo Scanner", subtitle: "Deterministic — no LLM" },
  architecture: { title: "Architecture Analyst", subtitle: "Module boundaries" },
  "code-quality": { title: "Code Quality", subtitle: "Naming, typing, complexity" },
  testing: { title: "Testing & Reliability", subtitle: "Tests, CI, coverage" },
  security: { title: "Security Awareness", subtitle: "Secrets, validation" },
  "ai-collaboration": { title: "AI Collaboration", subtitle: "AI usage patterns" },
  "git-evidence": { title: "Git Evidence", subtitle: "Commit cadence + quality" },
  documentation: { title: "Documentation", subtitle: "README specificity" },
  authenticity: { title: "Authenticity Signals", subtitle: "Ownership and provenance" },
  "interview-gen": { title: "Interview Generator", subtitle: "Questions from real code" },
  validator: { title: "Validator", subtitle: "Fresh context audit" },
  "skill-graph": { title: "Skill Graph", subtitle: "Weighted aggregation" },
  "profile-gen": { title: "Profile Generator", subtitle: "Verified credibility" },
};

function AgentTimeline({ events, partial }: { events: RunPayload["events"]; partial: boolean }) {
  return (
    <div className="space-y-4">
      {partial && (
        <StateNotice tone="warn" title="Partial" detail="Some evaluators completed. Remaining agents still running." />
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {events.map((event) => {
          const meta = AGENT_META[event.agent] ?? { title: event.agent, subtitle: "" };
          const keyFindings = event.key_findings ?? [];
          const missingProof = event.missing_proof ?? [];
          const isRunning = event.status === "running" || event.status === "in_progress";
          const isDone = event.status === "completed";
          const isFailed = event.status === "failed";

          return (
            <div
              key={`${event.order}-${event.agent}`}
              className={cn(
                "group relative overflow-hidden rounded-2xl border bg-panel/60 p-5 transition-all duration-300",
                isDone && "border-accent/25 bg-panel/75",
                isRunning && "border-warn/40 bg-warn/5 ring-1 ring-warn/20",
                isFailed && "border-bad/35 bg-bad/5",
                !isDone && !isRunning && !isFailed && "border-border/60"
              )}
            >
              {isDone && (
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(circle at 20% 50%, rgba(217,119,87,0.06) 0%, transparent 70%)",
                  }}
                />
              )}
              <div className="relative flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={cn("dot flex-shrink-0",
                    event.status === "completed" ? "dot-completed" :
                    event.status === "running" || event.status === "in_progress" ? "dot-running" :
                    event.status === "failed" ? "dot-failed" :
                    event.status === "skipped" ? "dot-skipped" :
                    "dot-pending"
                  )} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{meta.title}</div>
                    <div className="truncate text-xs text-muted">{meta.subtitle}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                    {event.status}
                  </span>
                  {event.duration_ms != null && (
                    <span className="font-mono text-[10px] text-muted/60">{event.duration_ms}ms</span>
                  )}
                </div>
              </div>

              {event.checked && (
                <p className="relative mt-3 text-xs leading-5 text-muted line-clamp-2">{event.checked}</p>
              )}

              {keyFindings.length > 0 && (
                <ul className="relative mt-3 space-y-1">
                  {keyFindings.slice(0, 2).map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-ink/80">
                      <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent/50" />
                      <span className="line-clamp-1">{f}</span>
                    </li>
                  ))}
                </ul>
              )}

              {event.score_contribution && (
                <div className="relative mt-3 flex items-center gap-2">
                  <span className="text-xs text-muted">{event.score_contribution.metric}</span>
                  <span className="font-mono text-xs font-semibold text-accent">
                    {event.score_contribution.score}/100
                  </span>
                </div>
              )}

              {missingProof.length > 0 && (
                <p className="relative mt-3 text-xs text-warn">{missingProof.join(" ")}</p>
              )}

              {isRunning && (
                <div className="relative mt-4 h-0.5 w-full overflow-hidden rounded-full bg-border">
                  <div className="skeleton-shimmer absolute inset-y-0 left-0 w-1/2 bg-warn" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceLocker({ run }: { run: RunPayload | null }) {
  const findings = run?.evidence_findings ?? [];
  if (findings.length) {
    return (
      <ul className="space-y-2">
        {findings.slice(0, 16).map((f) => (
          <li key={f.id} className="rounded-xl border border-border bg-panel2/35 p-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>{f.category}</Badge>
              {f.severity && <Badge tone={f.severity === "high" || f.severity === "critical" ? "bad" : f.severity === "medium" ? "warn" : "default"}>{f.severity}</Badge>}
              <span className="font-mono text-xs text-muted">{Math.round((f.confidence ?? 0) * 100)}%</span>
            </div>
            <p className="mt-2 text-ink">{f.redacted_text || f.claim}</p>
            {f.file_path && <p className="mt-2 font-mono text-xs text-muted">{f.file_path}{f.line_start ? `:${f.line_start}${f.line_end && f.line_end !== f.line_start ? `-${f.line_end}` : ""}` : ""}</p>}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-2">
      {(run?.scores ?? []).flatMap((s) => s.evidence.map((e, i) => ({ s, e, i }))).slice(0, 16).map(({ s, e, i }) => (
        <div key={`${s.skill}-${i}`} className="rounded-xl border border-border bg-panel2/35 p-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge>{s.skill}</Badge>
            <Badge>{e.source ?? s.source}</Badge>
          </div>
          <p className="mt-2 text-ink">{e.reason}</p>
          {e.file && <p className="mt-2 font-mono text-xs text-muted">{e.file}{e.line_start ? `:${e.line_start}${e.line_end ? `-${e.line_end}` : ""}` : ""}</p>}
        </div>
      ))}
    </div>
  );
}

function SkillGraph({ scores }: { scores: RunPayload["scores"] }) {
  const notMeasured = scores.filter((s) => s.score == null);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        {scores.map((s) => (
          <div key={s.skill} className="rounded-xl border border-border bg-panel2/35 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-ink">{s.skill}</div>
              <Badge tone={s.score == null ? "default" : s.source === "not_measured" ? "default" : "good"}>{s.score == null ? "not_measured" : `${s.score}/100`}</Badge>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-bg/70">
              <div className="h-full bg-good" style={{ width: `${s.score ?? 0}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
              <span>source={s.source}</span>
              <span>confidence={Math.round((s.confidence ?? 0) * 100)}%</span>
              <span>evidence={s.evidence.length}</span>
            </div>
            {s.validator_notes && <p className="mt-2 text-xs text-muted">{s.validator_notes}</p>}
          </div>
        ))}
      </div>
      {notMeasured.length > 0 && <StateNotice detail={`Not measured dimensions are excluded from the denominator: ${notMeasured.map((s) => s.skill).join(", ")}.`} />}
    </div>
  );
}

function TerminalProof({ run }: { run: RunPayload | null }) {
  if (!run) return null;
  const terminalSummary = run.terminal_summary ?? { total: 0, passed: 0, failed: 0, skipped: 0, by_use: {} };
  if (run.execution_mode === "api" && terminalSummary.total === 0) {
    return <StateNotice title="Terminal skipped" detail="API execution mode did not run terminal proof. This does not count as passed proof." />;
  }
  if (terminalSummary.total === 0) {
    return <StateNotice title="Terminal skipped" detail="No terminal evidence has been saved. Missing commands are not counted as proof." />;
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-4">
        <Metric label="Total" value={String(terminalSummary.total)} />
        <Metric label="Passed" value={String(terminalSummary.passed)} />
        <Metric label="Failed" value={String(terminalSummary.failed)} />
        <Metric label="Skipped" value={String(terminalSummary.skipped)} />
      </div>
      <ul className="space-y-2">
        {run.terminal_evidence.slice(0, 8).map((t, i) => (
          <li key={`${t.command}-${i}`} className="rounded-xl border border-border bg-bg/45 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={t.exitCode === 0 ? "good" : t.exitCode == null ? "default" : "bad"}>{t.exitCode == null ? t.statusLabel ?? "skipped" : `exit ${t.exitCode}`}</Badge>
              <Badge>{t.usedFor}</Badge>
              <code className="text-ink">{t.command}</code>
            </div>
            {t.outputSha256 && <p className="mt-2 font-mono text-xs text-muted">sha256:{String(t.outputSha256).slice(0, 24)}</p>}
            {(t.stdoutSummary || t.stderrSummary) && (
              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-panel2 p-2 font-mono text-[11px] text-muted">
                {[t.stdoutSummary, t.stderrSummary].filter(Boolean).join("\n")}
              </pre>
            )}
          </li>
        ))}
      </ul>
      <Link href={`/candidate/runs/${run.id}/terminal`} className="text-xs text-accent hover:underline">
        Open sandbox terminal
      </Link>
    </div>
  );
}

function InterviewQuestions({ run }: { run: RunPayload | null }) {
  if (!run) return null;
  const interviewSummary = run.interview_summary ?? { total: 0, answered: 0, verified: false };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StateNotice detail={`${interviewSummary.answered}/${interviewSummary.total} answered. Interview evidence upgrades verification only after answers are evaluated.`} />
        <Link href={`/candidate/interview/${run.id}`} className="text-xs text-accent hover:underline">Answer interview</Link>
      </div>
      <ul className="space-y-2">
        {run.questions.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-border bg-panel2/35 p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-ink">Q{i + 1}. {q.question}</p>
              {q.answer_score != null && <Badge tone="good">{q.answer_score}/100</Badge>}
            </div>
            {q.source_file && <p className="mt-2 font-mono text-xs text-muted">{q.source_file}{q.line_start ? `:${q.line_start}${q.line_end ? `-${q.line_end}` : ""}` : ""}</p>}
            <p className="mt-2 text-xs text-muted">{q.answer ? "Answered. Candidate answer text remains private by default." : "Not answered yet."}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProfilePreview({ run }: { run: RunPayload | null }) {
  if (!run) return null;
  const profile = run.profile_summary;
  const blockers = [
    run.status !== "completed" ? "Run must complete." : null,
    run.mock_mode ? "Mock or heuristic score source blocks publishing." : null,
    !run.provider_matrix ? "Provider matrix is missing." : null,
    !run.validation_summary ? "Validation summary is missing." : null,
    run.scores.some((s) => s.score != null && s.evidence.length === 0) ? "Every measured skill needs evidence." : null,
  ].filter(Boolean);
  return (
    <div className="space-y-4">
      {profile?.developer_summary ? (
        <div className="rounded-xl border border-border bg-panel2/35 p-4">
          <div className="text-sm font-semibold text-ink">Developer summary</div>
          <p className="mt-2 text-sm text-muted">{profile.developer_summary}</p>
        </div>
      ) : (
        <StateNotice detail="Employer-safe profile text has not been generated yet." />
      )}
      {run.employer_verifier && (
        <div className="grid gap-3 md:grid-cols-2">
          <MiniList title="Verified skills" items={run.employer_verifier.top_verified_skills ?? []} />
          <MiniList title="Risks" items={run.employer_verifier.biggest_risks ?? []} />
        </div>
      )}
      {blockers.length > 0 ? (
        <div className="rounded-xl border border-warn/30 bg-warn/10 p-3">
          <div className="text-sm font-semibold text-warn">Public publishing blockers</div>
          <ul className="mt-2 list-disc pl-5 text-xs text-muted">
            {blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      ) : (
        <PublishRunButton runId={run.id} />
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={`/api/report/export?run_id=${run.id}`} className="rounded-xl border border-border px-3 py-2 text-xs text-ink hover:border-accent">
          Export owner report
        </Link>
        {run.questions.length > 0 && (
          <Link href={`/candidate/interview/${run.id}`} className="rounded-xl border border-border px-3 py-2 text-xs text-ink hover:border-accent">
            Continue interview
          </Link>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel2/35 p-3">
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className="mt-1 break-words font-mono text-lg text-ink">{value}</div>
      {detail && <div className="mt-1 text-xs text-muted">{detail}</div>}
    </div>
  );
}

function MiniList({ title, items, empty = "None detected yet." }: { title: string; items: string[]; empty?: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel2/35 p-3">
      <div className="text-sm font-semibold text-ink">{title}</div>
      {items.length ? (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {items.slice(0, 10).map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">{empty}</p>
      )}
    </div>
  );
}

function StateNotice({ title = "No data yet", detail, tone = "default" }: { title?: string; detail: string; tone?: "default" | "warn" | "bad" }) {
  const styles = tone === "bad"
    ? "border-bad/35 bg-bad/10 text-bad"
    : tone === "warn"
      ? "border-warn/35 bg-warn/10 text-warn"
      : "border-border bg-bg/35 text-muted";
  return (
    <div className={cn("rounded-xl border px-3 py-2 text-xs", styles)}>
      <span className="font-semibold text-ink">{title}.</span> {detail}
    </div>
  );
}

function workerStatusTitle(state: NonNullable<RunPayload["worker_status"]>["state"]) {
  if (state === "unclaimed") return "Worker not running";
  if (state === "queued_retry") return "Queued for retry";
  if (state === "stale") return "Worker heartbeat stale";
  if (state === "failed") return "Worker failed";
  if (state === "completed") return "Worker completed";
  if (state === "active") return "Worker active";
  return "Worker status unknown";
}
