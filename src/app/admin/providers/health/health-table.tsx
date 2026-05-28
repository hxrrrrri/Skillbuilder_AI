"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

type Row = {
  providerId: string;
  label: string;
  status: string;
  enabled: boolean;
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  supportsJson: boolean;
  supportsNonInteractive: boolean;
  supportsModelSelection: boolean;
  supportsReasoningBudget: boolean;
  availableModels: string[];
  configuredModel: string | null;
  lastTestedAt: string | null;
  lastLatencyMs: number | null;
  lastRawOutputPreview: string | null;
  lastError: string | null;
  fix: string;
  command: string | null;
};

export function ProviderHealthTable({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <HealthRow key={row.providerId} row={row} />
      ))}
    </div>
  );
}

function HealthRow({ row }: { row: Row }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function runTest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/providers/${row.providerId}/test`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) setError(data?.message ?? data?.error ?? `HTTP ${res.status}`);
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="rounded-md border border-border bg-panel2/40">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`dot ${row.status === "ready" ? "dot-completed" : "dot-pending"}`} />
          <div>
            <div className="text-sm text-ink">{row.label}</div>
            <code className="text-[11px] text-muted">{row.providerId}</code>
          </div>
          <Badge tone={row.status === "ready" ? "good" : row.status === "disabled" ? "default" : "warn"}>{row.status}</Badge>
          <Badge tone={row.installed ? "good" : "bad"}>{row.installed ? "installed" : "missing"}</Badge>
          <Badge tone={row.authenticated ? "good" : "warn"}>{row.authenticated ? "authenticated" : "auth needed"}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/admin/agents?provider=${encodeURIComponent(row.providerId)}`}
            className="rounded-md border border-border bg-panel2 px-2 py-1 text-xs text-ink hover:border-accent/60 hover:text-accent"
          >
            Use for agents
          </a>
          {row.providerId !== "deterministic" && (
            <button
              type="button"
              onClick={runTest}
              disabled={busy}
              className="rounded-md border border-border bg-panel2 px-2 py-1 text-xs text-ink hover:border-accent/60 hover:text-accent disabled:opacity-40"
            >
              {busy ? "Testing..." : "Run test"}
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-[11px] sm:grid-cols-4">
        <KV k="Version" v={row.version ?? "-"} />
        <KV k="Command" v={row.command ?? "-"} />
        <KV k="Configured model" v={row.configuredModel ?? "-"} />
        <KV k="Last tested" v={row.lastTestedAt ? new Date(row.lastTestedAt).toLocaleString() : "never"} />
        <KV k="JSON" v={row.supportsJson ? "yes" : "no"} />
        <KV k="Non-interactive" v={row.supportsNonInteractive ? "yes" : "no"} />
        <KV k="Model flag" v={row.supportsModelSelection ? "yes" : "no"} />
        <KV k="Reasoning" v={row.supportsReasoningBudget ? "yes" : "no"} />
        <KV k="Latency" v={row.lastLatencyMs == null ? "-" : `${row.lastLatencyMs}ms`} />
        <KV k="Models" v={row.availableModels.length ? row.availableModels.slice(0, 4).join(", ") : "-"} />
        <div className="col-span-full text-muted">
          <span className="font-semibold uppercase tracking-wide text-[10px]">fix</span>: {row.fix}
        </div>
        {(row.lastError || error) && (
          <div className="col-span-full text-bad">
            <span className="font-semibold uppercase tracking-wide text-[10px]">error</span>: {error ?? row.lastError}
          </div>
        )}
        {row.lastRawOutputPreview && (
          <details className="col-span-full rounded border border-border bg-bg/40 p-2">
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-muted">raw output preview</summary>
            <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap text-[11px] text-muted">{row.lastRawOutputPreview}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="font-semibold uppercase tracking-wide text-[10px] text-muted">{k}</span>
      <div className="truncate font-mono text-[11px] text-ink">{v}</div>
    </div>
  );
}
