"use client";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ClientDateTime } from "@/components/ui/client-datetime";

type Event = {
  id: string;
  agent: string;
  status: string;
  order: number;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  output: any;
};

export function TraceEventList({ events }: { events: Event[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ol className="space-y-2">
      {events.map((e) => {
        const open = openId === e.id;
        const duration =
          e.startedAt && e.completedAt
            ? Math.round((new Date(e.completedAt).getTime() - new Date(e.startedAt).getTime()) / 10) / 100
            : null;
        return (
          <li
            key={e.id}
            className={cn(
              "rounded-md border bg-panel2/40 transition",
              e.status === "running" && "border-warn/40",
              e.status === "completed" && "border-accent/30",
              e.status === "skipped" && "border-warn/30",
              e.status === "failed" && "border-bad/40",
              (e.status === "pending" || !["running", "completed", "failed", "skipped"].includes(e.status)) && "border-border",
            )}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : e.id)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted">#{String(e.order + 1).padStart(2, "0")}</span>
                <span className={`dot dot-${e.status}`} />
                <span className="font-medium text-ink">{e.agent}</span>
                {e.notes && <span className="text-xs text-muted">· {e.notes}</span>}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted">
                {duration !== null && <span>{duration}s</span>}
                <span className="uppercase tracking-wide">{e.status}</span>
                <span className="text-muted">{open ? "▴" : "▾"}</span>
              </div>
            </button>
            {open && (
              <div className="border-t border-border bg-panel2/60 px-3 py-3 text-xs">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Field k="Started" v={<ClientDateTime value={e.startedAt} empty="—" />} />
                  <Field k="Completed" v={<ClientDateTime value={e.completedAt} empty="—" />} />
                  <Field k="Order" v={String(e.order)} />
                  <Field k="Status" v={e.status} />
                </div>
                <AdminTraceDetails event={e} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{k}</p>
      <p className="text-xs text-ink">{v}</p>
    </div>
  );
}

function AdminTraceDetails({ event }: { event: Event }) {
  const handoff = event.output ?? null;
  const runtime = handoff?.runtime ?? handoff?.output?.runtime ?? null;
  const output = handoff?.output ?? null;
  const evidence = Array.isArray(handoff?.evidence) ? handoff.evidence : Array.isArray(output?.evidence) ? output.evidence : [];
  const assertions = Array.isArray(handoff?.assertion_results)
    ? handoff.assertion_results
    : Array.isArray(output?.assertion_results)
      ? output.assertion_results
      : [];
  const hallucinated = Array.isArray(output?.hallucinated_files) ? output.hallucinated_files : [];
  const errors = [runtime?.note, handoff?.error, output?.error].filter(Boolean);
  const tokenIn = Number(runtime?.inputTokens ?? runtime?.input_tokens ?? 0);
  const tokenOut = Number(runtime?.outputTokens ?? runtime?.output_tokens ?? 0);
  const estimatedCost = estimateCost(tokenIn, tokenOut);

  return (
    <div className="mt-3 space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Runtime</p>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field k="Provider requested" v={runtime?.requestedProvider ?? runtime?.provider ?? "not recorded"} />
          <Field k="Provider used" v={runtime?.actualProvider ?? runtime?.provider ?? "not recorded"} />
          <Field k="Model requested" v={runtime?.requestedModel ?? runtime?.model ?? "not recorded"} />
          <Field k="Model used" v={runtime?.actualModel ?? runtime?.model ?? "not recorded"} />
          <Field k="Reasoning budget" v={runtime?.reasoningBudget ?? "not recorded"} />
          <Field k="Reasoning mapping" v={reasoningLabel(runtime?.reasoning)} />
          <Field k="Temperature" v={runtime?.temperature != null ? String(runtime.temperature) : "not recorded"} />
          <Field k="Max tokens" v={runtime?.maxTokens != null ? String(runtime.maxTokens) : "not recorded"} />
          <Field k="Token usage" v={tokenIn || tokenOut ? `${tokenIn} in / ${tokenOut} out` : "not recorded"} />
          <Field k="Estimated cost" v={estimatedCost ?? "not recorded"} />
          <Field k="Prompt version" v={runtime?.promptVersion ?? "not recorded"} />
          <Field k="Fallback / retry" v={runtime?.note ?? runtime?.status ?? "none recorded"} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <TracePanel title="What This Agent Checked">
          <List values={[...(handoff?.completed ?? []), ...(handoff?.issues_found ?? [])]} empty="No completed/issue notes recorded." />
        </TracePanel>
        <TracePanel title="Evidence Produced">
          <List
            values={evidence.map((item: any) => `${item.file ? `${item.file}: ` : ""}${item.reason ?? JSON.stringify(item)}`)}
            empty="No evidence payload recorded."
          />
        </TracePanel>
        <TracePanel title="Missing Proof / Next Action">
          <List
            values={[...(handoff?.unresolved ?? []), handoff?.next_recommended ? `Next: ${handoff.next_recommended}` : null].filter(Boolean)}
            empty="No missing proof recorded."
          />
        </TracePanel>
        <TracePanel title="Validation Assertions Covered">
          <List
            values={assertions.map((a: any) => `${a.assertion_id ?? "assertion"}: ${a.status ?? "unknown"} - ${a.notes ?? ""}`)}
            empty="No assertion coverage in this handoff."
          />
        </TracePanel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <TracePanel title="Raw Prompts">
          <p className="text-muted">
            Raw system and user prompts are not persisted in AgentEvent. Prompt versions are managed in the admin prompt registry.
          </p>
        </TracePanel>
        <TracePanel title="Model Response / Parsed JSON">
          {handoff ? (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-bg/40 p-3 text-[11px] text-muted">
              {JSON.stringify(handoff, null, 2)}
            </pre>
          ) : (
            <p className="text-muted">No handoff payload recorded.</p>
          )}
        </TracePanel>
      </div>

      {(hallucinated.length > 0 || errors.length > 0) && (
        <TracePanel title="Errors And Hallucinated Files">
          <List
            values={[...hallucinated.map((f: string) => `Hallucinated file: ${f}`), ...errors.map(String)]}
            empty="No errors recorded."
          />
        </TracePanel>
      )}
    </div>
  );
}

function TracePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded border border-border bg-bg/30 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function List({ values, empty }: { values: any[]; empty: string }) {
  const shown = values.filter((v) => typeof v === "string" && v.trim()).slice(0, 8);
  if (shown.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="list-disc space-y-1 pl-4 text-muted">
      {shown.map((v, i) => <li key={i}>{v}</li>)}
    </ul>
  );
}

function reasoningLabel(reasoning: any): string {
  if (!reasoning) return "not recorded";
  if (reasoning.kind === "anthropic_thinking") return reasoning.budgetTokens ? `anthropic ${reasoning.budgetTokens} tokens` : "anthropic off";
  if (reasoning.kind === "openai_effort") return `openai ${reasoning.effort ?? "off"}`;
  return reasoning.reason ?? reasoning.kind ?? "not recorded";
}

function estimateCost(inputTokens: number, outputTokens: number): string | null {
  if (!inputTokens && !outputTokens) return null;
  // Registry/provider-specific pricing is not persisted yet; this placeholder is
  // intentionally labeled as an estimate instead of a billable cost.
  return `estimated tokens ${inputTokens + outputTokens}`;
}
