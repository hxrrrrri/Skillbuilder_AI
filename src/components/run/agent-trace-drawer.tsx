"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Live agent-inspection modal. Polls GET /api/runs/[id]/agents/[agentName] while the run + agent are
// active, and stops once the agent reaches a terminal state. Candidate mode only
// ever renders the candidate-safe payload the endpoint returns; admin mode adds
// runtime, provenance, parsed output, and raw JSON tabs.

export type AgentTraceDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  agentName: string;
  mode: "candidate" | "admin";
  initialEvent?: any;
};

const ACTIVE = new Set(["pending", "running", "in_progress"]);

function statusToneClass(status: string): string {
  if (status === "completed") return "border-good/40 bg-good/10 text-good";
  if (status === "failed") return "border-bad/40 bg-bad/10 text-bad";
  if (status === "running" || status === "in_progress") return "border-warn/40 bg-warn/10 text-warn";
  if (status === "skipped") return "border-border bg-panel2/60 text-muted";
  return "border-border bg-panel2/60 text-muted";
}

export function AgentTraceDrawer({ open, onOpenChange, runId, agentName, mode, initialEvent }: AgentTraceDrawerProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("Overview");
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const dataRef = useRef<any>(null);

  const tabs = mode === "admin"
    ? ["Overview", "Runtime", "Evidence", "Output", "Validation", "Raw JSON"]
    : ["Overview", "Evidence", "Output"];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/agents/${encodeURIComponent(agentName)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || `request failed (${res.status})`);
      } else {
        setData(json);
        dataRef.current = json;
        setError(null);
      }
    } catch (err: any) {
      setError(err?.message || "network_error");
    } finally {
      setLoading(false);
      setLastFetched(Date.now());
    }
  }, [runId, agentName]);

  // Open lifecycle: reset, fetch, then poll while active.
  useEffect(() => {
    if (!open) return;
    setTab("Overview");
    setData(null);
    dataRef.current = null;
    setError(null);
    void load();
    const id = window.setInterval(() => {
      const d = dataRef.current;
      const runActive = !d || ACTIVE.has(d.run_status);
      const agentActive = !d || ACTIVE.has(d.status);
      if (runActive && agentActive) void load();
    }, 1500);
    return () => window.clearInterval(id);
  }, [open, runId, agentName, load]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const status = data?.status ?? initialEvent?.status ?? "pending";
  const polling = ACTIVE.has(data?.run_status ?? "running") && ACTIVE.has(status);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Agent inspector: ${agentName}`}>
      <button
        type="button"
        aria-label="Close agent inspector"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-panel/95 shadow-card scanlines">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("dot", status === "completed" ? "dot-completed" : status === "running" || status === "in_progress" ? "dot-running" : status === "failed" ? "dot-failed" : status === "skipped" ? "dot-skipped" : "dot-pending")} />
              <h2 className="truncate font-display text-lg text-ink">{agentName}</h2>
            </div>
            <p className="mt-1 truncate text-xs text-muted">{data?.checks ?? "Loading agent intelligence…"}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-lg border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide", statusToneClass(status))}>
              {status}
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-border px-2 py-1 text-sm text-muted transition hover:border-accent/60 hover:text-ink"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition",
                tab === t ? "bg-accent/15 text-ink" : "text-muted hover:bg-panel2/60 hover:text-ink",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          {!data && loading && <DrawerSkeleton />}
          {error && !data && (
            <div className="rounded-xl border border-bad/35 bg-bad/10 p-4 text-sm text-bad">
              <p className="font-semibold text-ink">Could not load agent trace</p>
              <p className="mt-1 text-xs text-bad">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs text-ink transition hover:border-accent/60"
              >
                Retry
              </button>
            </div>
          )}
          {data && (
            <DrawerTab tab={tab} data={data} mode={mode} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3 text-[11px] text-muted">
          <div className="flex items-center gap-2">
            {polling ? (
              <>
                <span className="dot dot-running" />
                <span>Live · polling every 1.5s</span>
              </>
            ) : (
              <span>Idle · agent reached a terminal state</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastFetched && <span className="tabular">updated {new Date(lastFetched).toLocaleTimeString()}</span>}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-md border border-border px-2 py-1 text-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-40"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DrawerTab({ tab, data, mode }: { tab: string; data: any; mode: "candidate" | "admin" }) {
  switch (tab) {
    case "Overview":
      return <OverviewTab data={data} />;
    case "Runtime":
      return <RuntimeTab runtime={data.runtime} skillRuns={data.skill_runs ?? []} />;
    case "Evidence":
      return <EvidenceTab data={data} mode={mode} />;
    case "Output":
      return <OutputTab data={data} mode={mode} />;
    case "Validation":
      return <ValidationTab results={data.assertion_results ?? []} />;
    case "Raw JSON":
      return <RawJsonTab data={data} />;
    default:
      return null;
  }
}

function OverviewTab({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <Section title="What this agent checks">
        <p className="text-ink/90">{data.checks}</p>
      </Section>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status" value={data.status} />
        <Field label="Duration" value={data.duration_ms != null ? `${data.duration_ms}ms` : "—"} />
        <Field label="Started" value={fmt(data.started_at)} />
        <Field label="Completed" value={fmt(data.completed_at)} />
      </div>
      {data.score_contribution && (
        <Section title="Score contribution">
          <p className="font-mono text-ink">
            {data.score_contribution.metric}: <span className="text-accent">{data.score_contribution.score}/100</span>
          </p>
        </Section>
      )}
      <Section title="Safe findings">
        <BulletList values={data.safe_findings ?? []} empty="No findings recorded yet." />
      </Section>
      <Section title="Missing proof / next action">
        <BulletList values={data.missing_proof ?? []} empty="No outstanding proof gaps." />
        <p className="mt-2 text-xs text-warn">{data.next_action}</p>
      </Section>
    </div>
  );
}

function RuntimeTab({ runtime, skillRuns }: { runtime: any; skillRuns: any[] }) {
  if (!runtime) return <Empty text="No runtime metadata recorded for this agent." />;
  const fields: Array<[string, ReactNode]> = [
    ["Provider requested", runtime.requested_provider ?? "—"],
    ["Provider used", runtime.actual_provider ?? "—"],
    ["Model requested", runtime.requested_model ?? "—"],
    ["Model used", runtime.actual_model ?? "—"],
    ["Reasoning budget", runtime.reasoning_budget ?? "—"],
    ["Reasoning mapping", runtime.reasoning ?? "—"],
    ["Temperature", runtime.temperature ?? "—"],
    ["Max tokens", runtime.max_tokens ?? "—"],
    ["Tokens", runtime.input_tokens || runtime.output_tokens ? `${runtime.input_tokens ?? 0} in / ${runtime.output_tokens ?? 0} out` : "—"],
    ["Estimated cost", runtime.estimated_cost ?? "—"],
    ["Prompt version", runtime.prompt_version ?? "—"],
    ["Fallback / retry", runtime.fallback_note ?? "none"],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {fields.map(([k, v]) => (
          <Field key={k} label={k} value={v} />
        ))}
      </div>
      <Section title={`SkillRun provenance (${skillRuns.length})`}>
        {skillRuns.length === 0 ? (
          <Empty text="No SkillRun rows tied to this agent." />
        ) : (
          <ul className="space-y-2">
            {skillRuns.map((s) => (
              <li key={s.id} className="rounded-lg border border-border bg-panel2/40 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded px-1.5 py-0.5", statusToneClass(s.status))}>{s.status}</span>
                  <code className="text-ink">{s.skill_id}</code>
                  {s.provider_id && <span className="text-muted">{s.provider_id}</span>}
                  {s.actual_model && <span className="text-muted">{s.actual_model}</span>}
                  {s.duration_ms != null && <span className="text-muted">{s.duration_ms}ms</span>}
                </div>
                {s.fallback_reason && <p className="mt-1 text-warn">fallback: {s.fallback_reason}</p>}
                {s.error && <p className="mt-1 text-bad">{s.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function EvidenceTab({ data, mode }: { data: any; mode: "candidate" | "admin" }) {
  const rows: any[] = mode === "admin" ? data.evidence_findings ?? [] : data.safe_evidence ?? [];
  if (rows.length === 0) return <Empty text="No evidence has been produced by this agent yet." />;
  return (
    <ul className="space-y-2">
      {rows.map((f) => (
        <li key={f.id} className="rounded-xl border border-border bg-panel2/40 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-panel2 px-1.5 py-0.5 text-muted">{f.category}</span>
            {f.severity && <span className="rounded bg-panel2 px-1.5 py-0.5 text-warn">{f.severity}</span>}
            <span className="font-mono text-muted">{Math.round((f.confidence ?? 0) * 100)}%</span>
            {mode === "admin" && f.admin_only && <span className="rounded bg-bad/15 px-1.5 py-0.5 text-bad">admin-only</span>}
          </div>
          <p className="mt-2 text-ink/90">{f.redacted_text || f.claim}</p>
          {f.file_path && (
            <p className="mt-1.5 font-mono text-xs text-muted">
              {f.file_path}
              {f.line_start ? `:${f.line_start}${f.line_end && f.line_end !== f.line_start ? `-${f.line_end}` : ""}` : ""}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function OutputTab({ data, mode }: { data: any; mode: "candidate" | "admin" }) {
  if (mode === "candidate") {
    return (
      <div className="space-y-4">
        <Section title="Summary findings">
          <BulletList values={data.safe_findings ?? []} empty="No summary available yet." />
        </Section>
        <Section title="Next action">
          <p className="text-warn">{data.next_action}</p>
        </Section>
        <p className="text-xs text-muted">Raw model output and prompts are not shown in candidate view.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Section title="Parsed model JSON">
        {data.parsed_output ? <Json value={data.parsed_output} /> : <Empty text="No parsed model output recorded." />}
      </Section>
      {Array.isArray(data.hallucinated_files) && data.hallucinated_files.length > 0 && (
        <Section title="Hallucinated file flags">
          <BulletList values={data.hallucinated_files} empty="None." />
        </Section>
      )}
      {Array.isArray(data.errors) && data.errors.length > 0 && (
        <Section title="Errors">
          <BulletList values={data.errors.map(String)} empty="None." />
        </Section>
      )}
    </div>
  );
}

function ValidationTab({ results }: { results: any[] }) {
  if (!results.length) return <Empty text="No validation assertions covered by this agent." />;
  return (
    <ul className="space-y-2">
      {results.map((a, i) => (
        <li key={a.assertion_id ?? i} className="rounded-lg border border-border bg-panel2/40 p-3 text-xs">
          <div className="flex items-center gap-2">
            <code className="text-ink">{a.assertion_id ?? `assertion ${i + 1}`}</code>
            <span className={cn("rounded px-1.5 py-0.5", statusToneClass(a.status ?? "pending"))}>{a.status ?? "unknown"}</span>
          </div>
          {a.notes && <p className="mt-1 text-muted">{a.notes}</p>}
        </li>
      ))}
    </ul>
  );
}

function RawJsonTab({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <Section title="Handoff JSON">
        {data.handoff ? <Json value={data.handoff} /> : <Empty text="No handoff payload recorded." />}
      </Section>
      {Array.isArray(data.admin_traces) && data.admin_traces.length > 0 && (
        <Section title="Admin trace JSON">
          <Json value={data.admin_traces} />
        </Section>
      )}
      {Array.isArray(data.terminal_runs) && data.terminal_runs.length > 0 && (
        <Section title={`Terminal command summaries (${data.terminal_runs.length})`}>
          <Json value={data.terminal_runs} />
        </Section>
      )}
    </div>
  );
}

// ── small presentational helpers ─────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-panel2/35 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 break-words font-mono text-xs text-ink">{value ?? "—"}</p>
    </div>
  );
}

function BulletList({ values, empty }: { values: any[]; empty: string }) {
  const shown = (values ?? []).filter((v) => typeof v === "string" && v.trim()).slice(0, 12);
  if (shown.length === 0) return <p className="text-xs text-muted">{empty}</p>;
  return (
    <ul className="space-y-1">
      {shown.map((v, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-ink/90">
          <span aria-hidden className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent/60" />
          <span>{v}</span>
        </li>
      ))}
    </ul>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-bg/60 p-3 font-mono text-[11px] text-muted">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-border bg-bg/35 px-3 py-2 text-xs text-muted">{text}</p>;
}

function DrawerSkeleton() {
  return (
    <div className="space-y-3">
      <div className="sp-skel h-5 w-1/2 rounded-md" />
      <div className="sp-skel h-20 rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <div className="sp-skel h-14 rounded-lg" />
        <div className="sp-skel h-14 rounded-lg" />
        <div className="sp-skel h-14 rounded-lg" />
        <div className="sp-skel h-14 rounded-lg" />
      </div>
      <div className="sp-skel h-24 rounded-xl" />
    </div>
  );
}

function fmt(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
