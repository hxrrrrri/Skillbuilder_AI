"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { TrafficLights } from "@/components/ui/card";
import { ClientDateTime } from "@/components/ui/client-datetime";
import { cn } from "@/lib/utils";

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
  lastTestJsonOk: boolean | null;
  fix: string;
  command: string | null;
  /* edit fields from provider config */
  apiKeyEnv: string | null;
  baseUrl: string | null;
  notes: string | null;
};

export function ProviderHealthTable({ rows }: { rows: Row[] }) {
  const [liveRows, setLiveRows] = useState(rows);

  useEffect(() => {
    setLiveRows(rows);
  }, [rows]);

  function patchRow(providerId: string, patch: Partial<Row>) {
    setLiveRows((current) => current.map((row) => (row.providerId === providerId ? { ...row, ...patch } : row)));
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {liveRows.map((row) => (
        <HealthRow key={row.providerId} row={row} patchRow={patchRow} />
      ))}
    </div>
  );
}

function HealthRow({ row, patchRow }: { row: Row; patchRow: (providerId: string, patch: Partial<Row>) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [defaultModel, setDefaultModel] = useState(row.configuredModel ?? "");
  const [apiKeyEnv, setApiKeyEnv] = useState(row.apiKeyEnv ?? "");
  const [baseUrl, setBaseUrl] = useState(row.baseUrl ?? "");
  const [command, setCommand] = useState(row.command ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");

  const modelOptions = row.availableModels ?? [];
  const defaultModelOptions =
    defaultModel && !modelOptions.includes(defaultModel)
      ? [defaultModel, ...modelOptions]
      : modelOptions;

  async function runTest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/providers/${row.providerId}/test`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      patchRow(row.providerId, {
        status: data?.json_parse_success ? "ready" : data?.available === false ? "failed" : "invalid_json",
        lastTestedAt: new Date().toISOString(),
        lastLatencyMs: typeof data?.latency_ms === "number" ? data.latency_ms : row.lastLatencyMs,
        lastRawOutputPreview: typeof data?.raw === "string" ? data.raw : row.lastRawOutputPreview,
        lastError: data?.error ?? null,
        lastTestJsonOk: typeof data?.json_parse_success === "boolean" ? data.json_parse_success : false,
        configuredModel: data?.model ?? row.configuredModel,
      });
      if (!res.ok || data?.error) setError(data?.message ?? data?.error ?? `HTTP ${res.status}`);
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  async function save() {
    setError(null);
    const patch = {
      defaultModel: defaultModel || null,
      baseUrl: baseUrl || null,
      command: command || null,
      apiKeyEnv: apiKeyEnv || null,
      notes: notes || null,
    };
    const resp = await fetch(`/api/admin/providers/${row.providerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      setError(data?.error ?? `HTTP ${resp.status}`);
      return;
    }
    setOpen(false);
    startTransition(() => router.refresh());
  }

  const statusTone =
    row.status === "ready" ? "good" : row.status === "disabled" ? "default" : "warn";

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-2xl border bg-panel/60 backdrop-blur-sm transition-all duration-300",
          row.status === "ready"
            ? "border-border hover:border-good/30 hover:bg-panel/80"
            : "border-border/50 opacity-80 hover:opacity-100"
        )}
      >
        {/* ── Card header ── */}
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <TrafficLights className="flex-shrink-0" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{row.label}</div>
              <code className="font-mono text-[11px] text-muted">{row.providerId}</code>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {row.providerId !== "deterministic" && (
              <button
                type="button"
                onClick={runTest}
                disabled={busy}
                className="rounded-lg border border-border bg-panel2 px-2.5 py-1 text-[11px] text-ink transition-all hover:border-accent/60 hover:text-accent disabled:opacity-40"
              >
                {busy ? "Testing…" : "Test"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg border border-border bg-panel2 px-2.5 py-1 text-[11px] text-ink transition-all hover:border-accent/60 hover:text-accent"
            >
              Edit
            </button>
          </div>
        </div>

        {/* ── Badge strip ── */}
        <div className="flex flex-wrap gap-1.5 px-5 pb-4">
          <Badge tone={statusTone}>{row.status}</Badge>
          <Badge tone={row.installed ? "good" : "bad"}>
            {row.installed ? "installed" : "missing"}
          </Badge>
          <Badge tone={row.authenticated ? "good" : "warn"}>
            {row.authenticated ? "authenticated" : "auth needed"}
          </Badge>
        </div>

        {/* ── Metrics grid ── */}
        <div className="mt-auto grid grid-cols-2 border-t border-border sm:grid-cols-4">
          {[
            { k: "VERSION", v: row.version ?? "—" },
            { k: "LATENCY", v: row.lastLatencyMs != null ? `${row.lastLatencyMs}ms` : "—" },
            { k: "JSON", v: row.lastTestJsonOk == null ? "—" : row.lastTestJsonOk ? "pass" : "fail" },
            { k: "REASONING", v: row.supportsReasoningBudget ? "yes" : "no" },
          ].map(({ k, v }) => (
            <div key={k} className="px-3 py-3 text-center">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/60">{k}</div>
              <div className="mt-1 truncate font-mono text-xs font-medium text-ink">{v}</div>
            </div>
          ))}
        </div>

        {/* ── Footer strip ── */}
        <div className="grid grid-cols-2 border-t border-border">
          <div className="px-4 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">Model</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
              {row.configuredModel || "—"}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">Command</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
              {row.command || "—"}
            </div>
          </div>
        </div>

        {/* ── Fix / last tested row ── */}
        <div className="border-t border-border px-4 py-2">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">Tested </span>
          <span className="font-mono text-[11px] text-muted">
            <ClientDateTime value={row.lastTestedAt} empty="never" />
          </span>
        </div>

        {(row.lastError || error) && (
          <p className="border-t border-border px-4 py-2 text-xs text-bad">
            {error ?? row.lastError}
          </p>
        )}

        <div className="border-t border-border px-4 py-2">
          <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">Last LLM Output</div>
          <pre className="mt-1 line-clamp-3 whitespace-pre-wrap break-words font-mono text-[10px] text-muted">
            {row.lastRawOutputPreview || "—"}
          </pre>
        </div>

        {/* agents link */}
        <div className="border-t border-border px-4 py-2">
          <a
            href={`/admin/agents?provider=${encodeURIComponent(row.providerId)}`}
            className="text-[11px] text-accent/70 hover:text-accent"
          >
            Use for agents →
          </a>
        </div>
      </div>

      {/* ── Edit modal ── */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-ink">{row.label}</p>
                <p className="mt-0.5 text-[11px] text-muted">Provider settings</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-lg leading-none text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="p-5 text-xs">
              <div className="mb-3 rounded-xl border border-border/60 bg-panel2/40 px-3 py-2 text-[11px] text-muted">
                <span className="font-semibold uppercase tracking-widest text-[9px]">Fix hint</span>
                <div className="mt-0.5">{row.fix}</div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Default model">
                  <select
                    value={defaultModel}
                    onChange={(e) => setDefaultModel(e.target.value)}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                  >
                    <option value="">Provider default</option>
                    {defaultModelOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field label="API key env var">
                  <input
                    value={apiKeyEnv}
                    onChange={(e) => setApiKeyEnv(e.target.value)}
                    placeholder="ANTHROPIC_API_KEY"
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 font-mono text-xs text-ink"
                  />
                </Field>
                <Field label="Command (CLI providers)">
                  <input
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                  />
                </Field>
                <Field label="Base URL (local providers)">
                  <input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                  />
                </Field>
                <Field label="Notes" className="sm:col-span-2">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-border bg-bg/65 p-2 text-xs text-ink"
                  />
                </Field>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={pending}
                  className="rounded-xl border border-accent/70 bg-accent px-4 py-1.5 text-xs font-semibold text-cream shadow-glow disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-border bg-panel2 px-4 py-1.5 text-xs text-muted hover:text-ink"
                >
                  Cancel
                </button>
                {error && <span className="text-xs text-bad">{error}</span>}
              </div>
            </div>

            {row.lastRawOutputPreview && (
              <div className="border-t border-border px-5 pb-5">
                <details className="mt-3 rounded-xl border border-border bg-bg/40 p-3">
                  <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Raw output preview
                  </summary>
                  <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap text-[11px] text-muted">
                    {row.lastRawOutputPreview}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</label>
      {children}
    </div>
  );
}
