"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { TrafficLights } from "@/components/ui/card";
import { ClientDateTime } from "@/components/ui/client-datetime";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  providerId: string;
  label: string;
  kind: string;
  enabled: boolean;
  defaultModel: string | null;
  baseUrl: string | null;
  command: string | null;
  apiKeyEnv: string | null;
  notes: string | null;
  capabilities: {
    reasoning?: boolean;
    jsonMode?: boolean;
    streaming?: boolean;
    models?: string[];
  } | null;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestModel: string | null;
  lastTestRaw: string | null;
  lastTestJsonOk: boolean | null;
  lastTestLatencyMs: number | null;
  lastTestError: string | null;
  liveAvailable: boolean;
};

export function ProviderTable({ rows }: { rows: Row[] }) {
  const [liveRows, setLiveRows] = useState(rows);

  useEffect(() => {
    setLiveRows(rows);
  }, [rows]);

  const patchRow = useCallback((providerId: string, patch: Partial<Row>) => {
    setLiveRows((current) => current.map((row) => (row.providerId === providerId ? { ...row, ...patch } : row)));
  }, []);

  const refreshLiveRows = useCallback(async () => {
    const resp = await fetch("/api/admin/providers?live=1", { cache: "no-store" });
    if (!resp.ok) return;
    const data = await resp.json().catch(() => null);
    if (!Array.isArray(data?.providers)) return;
    setLiveRows((current) =>
      current.map((row) => {
        const live = data.providers.find((p: any) => p?.providerId === row.providerId);
        if (!live) return row;
        return {
          ...row,
          label: live.label ?? row.label,
          kind: live.kind ?? row.kind,
          enabled: live.enabled ?? row.enabled,
          defaultModel: live.defaultModel ?? row.defaultModel,
          baseUrl: live.baseUrl ?? row.baseUrl,
          command: live.command ?? row.command,
          apiKeyEnv: live.apiKeyEnv ?? row.apiKeyEnv,
          notes: live.notes ?? row.notes,
          capabilities: live.capabilities ?? row.capabilities,
          liveAvailable: live.liveAvailable ?? row.liveAvailable,
        };
      }),
    );
  }, []);

  useEffect(() => {
    refreshLiveRows().catch(() => {});
  }, [refreshLiveRows]);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {liveRows.map((r) => (
        <ProviderRow key={r.id} row={r} patchRow={patchRow} refreshLiveRows={refreshLiveRows} />
      ))}
    </div>
  );
}

function ProviderRow({
  row,
  patchRow,
  refreshLiveRows,
}: {
  row: Row;
  patchRow: (providerId: string, patch: Partial<Row>) => void;
  refreshLiveRows: () => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(row.enabled);
  const [defaultModel, setDefaultModel] = useState(row.defaultModel ?? "");
  const [baseUrl, setBaseUrl] = useState(row.baseUrl ?? "");
  const [command, setCommand] = useState(row.command ?? "");
  const [apiKeyEnv, setApiKeyEnv] = useState(row.apiKeyEnv ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [testBusy, setTestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelOptions = row.capabilities?.models ?? [];
  const defaultModelOptions =
    defaultModel && !modelOptions.includes(defaultModel)
      ? [defaultModel, ...modelOptions]
      : modelOptions;

  const caps = row.capabilities
    ? [
        row.capabilities.reasoning ? "reasoning" : null,
        row.capabilities.jsonMode ? "json-mode" : null,
        row.capabilities.streaming ? "stream" : null,
      ]
        .filter(Boolean)
        .join(", ") || "—"
    : "—";

  async function save() {
    setError(null);
    const patch = {
      enabled,
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
      patchRow(row.providerId, patch);
    setOpen(false);
    await refreshLiveRows().catch(() => {});
    startTransition(() => router.refresh());
  }

  async function quickToggle() {
    setError(null);
    const next = !enabled;
    setEnabled(next);
    const resp = await fetch(`/api/admin/providers/${row.providerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (!resp.ok) {
      setEnabled(!next);
      const data = await resp.json().catch(() => ({}));
      setError(data?.error ?? `HTTP ${resp.status}`);
      return;
    }
    patchRow(row.providerId, { enabled: next });
    startTransition(() => router.refresh());
  }

  async function runTest() {
    setTestBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/providers/${row.providerId}/test`, {
        method: "POST",
      });
      const data = await resp.json().catch(() => ({}));
      patchRow(row.providerId, {
        lastTestedAt: new Date().toISOString(),
        lastTestStatus: data?.json_parse_success ? "ok" : data?.available === false ? "unavailable" : "fail",
        lastTestModel: data?.model ?? row.lastTestModel,
        lastTestRaw: typeof data?.raw === "string" ? data.raw : row.lastTestRaw,
        lastTestJsonOk: typeof data?.json_parse_success === "boolean" ? data.json_parse_success : false,
        lastTestLatencyMs: typeof data?.latency_ms === "number" ? data.latency_ms : row.lastTestLatencyMs,
        lastTestError: data?.error ?? null,
        liveAvailable: !!data?.available && data?.json_parse_success !== false,
      });
      if (!resp.ok || data?.error) {
        setError(data?.error ?? `HTTP ${resp.status}`);
      }
    } finally {
      setTestBusy(false);
      await refreshLiveRows().catch(() => {});
      startTransition(() => router.refresh());
    }
  }

  const testTone =
    row.lastTestStatus === "ok"
      ? "good"
      : row.lastTestStatus === "unavailable"
      ? "warn"
      : row.lastTestStatus
      ? "bad"
      : "default";

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-2xl border bg-panel/60 backdrop-blur-sm transition-all duration-300",
          enabled
            ? "border-border hover:border-good/30 hover:bg-panel/80"
            : "border-border/50 opacity-75 hover:opacity-100"
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
            <button
              type="button"
              onClick={quickToggle}
              disabled={pending}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all duration-200",
                enabled
                  ? "border-good/35 bg-good/10 text-good hover:bg-good/15"
                  : "border-border bg-panel2 text-muted hover:text-ink"
              )}
            >
              {enabled ? "Enabled" : "Disabled"}
            </button>
            <button
              type="button"
              onClick={runTest}
              disabled={testBusy}
              className="rounded-lg border border-border bg-panel2 px-2.5 py-1 text-[11px] text-ink transition-all hover:border-accent/60 hover:text-accent disabled:opacity-40"
            >
              {testBusy ? "Testing…" : "Test"}
            </button>
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
          <Badge tone="default">{row.kind}</Badge>
          <Badge tone={row.liveAvailable ? "good" : "warn"}>
            {row.liveAvailable ? "live: ok" : "live: unavailable"}
          </Badge>
          {row.lastTestStatus && (
            <Badge tone={testTone}>test: {row.lastTestStatus}</Badge>
          )}
          {caps !== "—" && <Badge tone="default">{caps}</Badge>}
        </div>

        {/* ── Metrics grid ── */}
        <div className="mt-auto grid grid-cols-2 border-t border-border sm:grid-cols-4">
          {[
            { k: "MODEL", v: defaultModel || "default" },
            { k: "LATENCY", v: row.lastTestLatencyMs != null ? `${row.lastTestLatencyMs}ms` : "—" },
            { k: "JSON", v: row.lastTestJsonOk == null ? "—" : row.lastTestJsonOk ? "ok" : "fail" },
            { k: "MODELS", v: String(row.capabilities?.models?.length ?? 0) },
          ].map(({ k, v }) => (
            <div key={k} className="bg-panel2/20 px-3 py-3 text-center">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/60">{k}</div>
              <div className="mt-1 truncate font-mono text-xs font-medium text-ink">{v}</div>
            </div>
          ))}
        </div>

        {/* ── Footer strip ── */}
        <div className="grid grid-cols-2 border-t border-border">
          <div className="px-4 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">API Key Env</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
              {row.apiKeyEnv || "—"}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">
              {row.baseUrl ? "Base URL" : "Command"}
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
              {row.baseUrl || row.command || "—"}
            </div>
          </div>
        </div>

        {/* ── Last tested row ── */}
        <div className="border-t border-border px-4 py-2">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">Tested </span>
          <span className="font-mono text-[11px] text-muted">
            <ClientDateTime value={row.lastTestedAt} empty="never" />
          </span>
        </div>

        <div className="border-t border-border px-4 py-2">
          <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">Last LLM Output</div>
          <pre className="mt-1 line-clamp-3 whitespace-pre-wrap break-words font-mono text-[10px] text-muted">
            {row.lastTestRaw || "—"}
          </pre>
        </div>

        {error && (
          <p className="border-t border-border px-4 py-2 text-xs text-bad">{error}</p>
        )}
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
                <code className="mt-0.5 font-mono text-[11px] text-muted">{row.providerId}</code>
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

            {row.lastTestRaw && (
              <div className="border-t border-border px-5 pb-5">
                <details className="mt-3 rounded-xl border border-border bg-bg/40 p-3">
                  <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Last raw output
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-muted">
                    {row.lastTestRaw}
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
