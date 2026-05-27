"use client";
import { useState } from "react";
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
              e.status === "failed" && "border-bad/40",
              (e.status === "pending" || !["running", "completed", "failed"].includes(e.status)) && "border-border",
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
                  <Field k="Started" v={e.startedAt ? new Date(e.startedAt).toLocaleString() : "—"} />
                  <Field k="Completed" v={e.completedAt ? new Date(e.completedAt).toLocaleString() : "—"} />
                  <Field k="Order" v={String(e.order)} />
                  <Field k="Status" v={e.status} />
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Structured handoff</p>
                  {e.output ? (
                    <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-bg/40 p-3 text-[11px] text-muted">
                      {JSON.stringify(e.output, null, 2)}
                    </pre>
                  ) : (
                    <p className="mt-1 text-muted">No handoff payload recorded.</p>
                  )}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{k}</p>
      <p className="text-xs text-ink">{v}</p>
    </div>
  );
}
