"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PublishRunButton } from "./publish-run-button";

type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";

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
  if (status === "running") return "warn" as const;
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

  async function load() {
    try {
      const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "run_load_failed");
        return;
      }
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
      setRun((current) => {
        if (current && current.status !== "pending" && current.status !== "running") return current;
        void load();
        return current;
      });
    }, 2500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const isActive = run?.status === "pending" || run?.status === "running" || (loading && !run);
  const completedAgentCount = run?.events.filter((e) => e.status === "completed").length ?? 0;
  const totalAgentCount = run?.events.length ?? STAGES.filter((s) => s.agent).length;
  const progressPercent = totalAgentCount ? Math.round((completedAgentCount / totalAgentCount) * 100) : 0;
  const failedEvent = run?.events.find((e) => e.status === "failed");

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
          <AgentTimeline events={run?.events ?? []} partial={run?.status === "running"} />
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
          loading={isActive && run?.execution_mode !== "api" && !run?.terminal_summary?.total}
          loadingText="Waiting for sandbox policy and terminal proof..."
          ready={!!run?.terminal_summary?.total || run?.execution_mode === "api"}
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
          <li key={stage.key} className="flex gap-3 rounded-md border border-border bg-panel2/35 p-2.5">
            <span className={cn("dot mt-1", status === "completed" ? "dot-completed" : status === "running" ? "dot-running" : status === "failed" ? "dot-failed" : status === "skipped" ? "dot-skipped" : "dot-pending")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-ink">{stage.label}</span>
                <span className="font-mono text-[10px] uppercase text-muted">{status}</span>
              </div>
              {ev?.checked && <p className="mt-1 text-xs text-muted">{ev.checked}</p>}
              {status === "running" && <p className="mt-1 font-mono text-[11px] text-warn">running provider-backed check...</p>}
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
      <div className="skeleton-shimmer h-10 rounded-md" />
      <div className="skeleton-shimmer h-24 rounded-md" />
      <div className="grid gap-2 md:grid-cols-3">
        <div className="skeleton-shimmer h-16 rounded-md" />
        <div className="skeleton-shimmer h-16 rounded-md" />
        <div className="skeleton-shimmer h-16 rounded-md" />
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
          <div key={role} className="rounded-md border border-border bg-panel2/35 p-3">
            <div className="text-xs uppercase text-muted">{role}</div>
            <div className="mt-1 font-mono text-xs text-ink">{matrix[role] ?? "not set"}</div>
          </div>
        ))}
      </div>
      <div className="max-h-72 overflow-auto rounded-md border border-border">
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
          <li key={a.id} className="rounded-md border border-border bg-panel2/35 p-3 text-sm">
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

function AgentTimeline({ events, partial }: { events: RunPayload["events"]; partial: boolean }) {
  return (
    <div className="space-y-2">
      {partial && <StateNotice tone="warn" title="Partial" detail="Some evaluators completed. Remaining agents still running." />}
      {events.map((event) => (
        <div key={`${event.order}-${event.agent}`} className="rounded-md border border-border bg-panel2/35 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(event.status)}>{event.status}</Badge>
            <span className="font-mono text-xs text-ink">{event.agent}</span>
            {event.duration_ms != null && <span className="text-xs text-muted">{event.duration_ms}ms</span>}
          </div>
          <p className="mt-2 text-sm text-muted">{event.checked}</p>
          {event.key_findings.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink">
              {event.key_findings.slice(0, 3).map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
          {event.missing_proof.length > 0 && <p className="mt-2 text-xs text-warn">{event.missing_proof.join(" ")}</p>}
        </div>
      ))}
    </div>
  );
}

function EvidenceLocker({ run }: { run: RunPayload | null }) {
  const findings = run?.evidence_findings ?? [];
  if (findings.length) {
    return (
      <ul className="space-y-2">
        {findings.slice(0, 16).map((f) => (
          <li key={f.id} className="rounded-md border border-border bg-panel2/35 p-3 text-sm">
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
        <div key={`${s.skill}-${i}`} className="rounded-md border border-border bg-panel2/35 p-3 text-sm">
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
          <div key={s.skill} className="rounded-md border border-border bg-panel2/35 p-3">
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
  if (run.execution_mode === "api" && run.terminal_summary.total === 0) {
    return <StateNotice title="Terminal skipped" detail="API execution mode did not run terminal proof. This does not count as passed proof." />;
  }
  if (run.terminal_summary.total === 0) {
    return <StateNotice title="Terminal skipped" detail="No terminal evidence has been saved. Missing commands are not counted as proof." />;
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-4">
        <Metric label="Total" value={String(run.terminal_summary.total)} />
        <Metric label="Passed" value={String(run.terminal_summary.passed)} />
        <Metric label="Failed" value={String(run.terminal_summary.failed)} />
        <Metric label="Skipped" value={String(run.terminal_summary.skipped)} />
      </div>
      <ul className="space-y-2">
        {run.terminal_evidence.slice(0, 8).map((t, i) => (
          <li key={`${t.command}-${i}`} className="rounded-md border border-border bg-bg/45 p-3">
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
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StateNotice detail={`${run.interview_summary.answered}/${run.interview_summary.total} answered. Interview evidence upgrades verification only after answers are evaluated.`} />
        <Link href={`/candidate/interview/${run.id}`} className="text-xs text-accent hover:underline">Answer interview</Link>
      </div>
      <ul className="space-y-2">
        {run.questions.map((q, i) => (
          <li key={q.id} className="rounded-md border border-border bg-panel2/35 p-3 text-sm">
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
        <div className="rounded-md border border-border bg-panel2/35 p-4">
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
        <div className="rounded-md border border-warn/30 bg-warn/10 p-3">
          <div className="text-sm font-semibold text-warn">Public publishing blockers</div>
          <ul className="mt-2 list-disc pl-5 text-xs text-muted">
            {blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      ) : (
        <PublishRunButton runId={run.id} />
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={`/api/report/export?run_id=${run.id}`} className="rounded-md border border-border px-3 py-2 text-xs text-ink hover:border-accent">
          Export owner report
        </Link>
        {run.questions.length > 0 && (
          <Link href={`/candidate/interview/${run.id}`} className="rounded-md border border-border px-3 py-2 text-xs text-ink hover:border-accent">
            Continue interview
          </Link>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-border bg-panel2/35 p-3">
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className="mt-1 break-words font-mono text-lg text-ink">{value}</div>
      {detail && <div className="mt-1 text-xs text-muted">{detail}</div>}
    </div>
  );
}

function MiniList({ title, items, empty = "None detected yet." }: { title: string; items: string[]; empty?: string }) {
  return (
    <div className="rounded-md border border-border bg-panel2/35 p-3">
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
    <div className={cn("rounded-md border px-3 py-2 text-xs", styles)}>
      <span className="font-semibold text-ink">{title}.</span> {detail}
    </div>
  );
}
