"use client";

import { useState } from "react";
import { AgentTraceDrawer } from "@/components/run/agent-trace-drawer";
import { ClientDateTime } from "@/components/ui/client-datetime";
import { StatusLight } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

export function TraceEventList({ events, runId }: { events: Event[]; runId: string }) {
  const [inspectAgent, setInspectAgent] = useState<string | null>(null);

  return (
    <>
      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {events.map((event) => {
          const duration =
            event.startedAt && event.completedAt
              ? Math.round((new Date(event.completedAt).getTime() - new Date(event.startedAt).getTime()) / 10) / 100
              : null;
          const healthy = event.status === "completed";

          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => setInspectAgent(event.agent)}
                className={cn(
                  "group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-panel/60 text-left backdrop-blur-sm transition-all duration-300 hover:border-accent/60 hover:bg-panel/80",
                  healthy ? "border-border" : "border-bad/35",
                )}
                aria-label={`Open live inspector for ${event.agent}`}
              >
                <div className="flex items-start justify-between gap-3 p-5 pb-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusLight healthy={healthy} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{event.agent}</div>
                      <div className="font-mono text-[11px] text-muted">event #{String(event.order + 1).padStart(2, "0")}</div>
                    </div>
                  </div>
                  <span className={cn("font-mono text-[10px] uppercase tracking-widest", healthy ? "text-good" : "text-bad")}>
                    {event.status}
                  </span>
                </div>

                <p className="min-h-12 px-5 pb-4 text-xs leading-5 text-muted">{event.notes || "No event notes recorded."}</p>

                <div className="mt-auto grid grid-cols-2 border-t border-border">
                  <Metric label="Started" value={<ClientDateTime value={event.startedAt} empty="-" />} />
                  <Metric label="Duration" value={duration == null ? "-" : `${duration}s`} />
                </div>

                <div className="border-t border-border px-4 py-2.5 text-right text-[11px] font-medium text-accent">
                  Open live inspector -&gt;
                </div>
              </button>
            </li>
          );
        })}
      </ol>
      <AgentTraceDrawer
        open={!!inspectAgent}
        onOpenChange={(open) => !open && setInspectAgent(null)}
        runId={runId}
        agentName={inspectAgent ?? ""}
        mode="admin"
      />
    </>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">{label}</div>
      <div className="mt-0.5 truncate font-mono text-[11px] text-muted">{value}</div>
    </div>
  );
}
