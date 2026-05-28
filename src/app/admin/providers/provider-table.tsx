"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ClientDateTime } from "@/components/ui/client-datetime";

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
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <ProviderRow key={r.id} row={r} />
      ))}
    </div>
  );
}

function ProviderRow({ row }: { row: Row }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
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
  const defaultModelOptions = defaultModel && !modelOptions.includes(defaultModel)
    ? [defaultModel, ...modelOptions]
    : modelOptions;

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
    setEdit(false);
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
    startTransition(() => router.refresh());
  }

  async function runTest() {
    setTestBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/providers/${row.providerId}/test`, {
        method: "POST",
      });
      if (!resp.ok && resp.status !== 200) {
        const data = await resp.json().catch(() => ({}));
        setError(data?.error ?? `HTTP ${resp.status}`);
      }
    } finally {
      setTestBusy(false);
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="rounded-md border border-border bg-panel2/40">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
        <div className="flex items-center gap-3">
          <span className={`dot ${enabled ? "dot-completed" : "dot-pending"}`} />
          <div>
            <div className="text-sm text-ink">{row.label}</div>
            <code className="text-[11px] text-muted">{row.providerId}</code>
          </div>
          <Badge tone="default">{row.kind}</Badge>
          <Badge tone={row.liveAvailable ? "good" : "warn"}>
            {row.liveAvailable ? "live: available" : "live: unavailable"}
          </Badge>
          {row.lastTestStatus && (
            <Badge
              tone={
                row.lastTestStatus === "ok"
                  ? "good"
                  : row.lastTestStatus === "unavailable"
                  ? "warn"
                  : "bad"
              }
            >
              last test: {row.lastTestStatus}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={quickToggle}
            disabled={pending}
            className={`rounded-md border px-2 py-1 text-xs transition ${
              enabled
                ? "border-good/40 bg-good/10 text-good"
                : "border-border bg-panel2 text-muted"
            }`}
          >
            {enabled ? "Enabled" : "Disabled"}
          </button>
          <button
            type="button"
            onClick={runTest}
            disabled={testBusy}
            className="rounded-md border border-border bg-panel2 px-2 py-1 text-xs text-ink hover:border-accent/60 hover:text-accent disabled:opacity-40"
          >
            {testBusy ? "Testing…" : "Run test"}
          </button>
          <button
            type="button"
            onClick={() => setEdit((v) => !v)}
            className="rounded-md border border-border bg-panel2 px-2 py-1 text-xs text-ink hover:border-accent/60 hover:text-accent"
          >
            {edit ? "Cancel" : "Edit"}
          </button>
        </div>
      </div>

      {!edit && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-[11px] sm:grid-cols-4">
          <KV k="Default model" v={row.defaultModel ?? "—"} />
          <KV k="API key env" v={row.apiKeyEnv ?? "—"} />
          <KV k="Command" v={row.command ?? "—"} />
          <KV k="Base URL" v={row.baseUrl ?? "—"} />
          <KV
            k="Capabilities"
            v={
              row.capabilities
                ? [
                    row.capabilities.reasoning ? "reasoning" : null,
                    row.capabilities.jsonMode ? "json-mode" : null,
                    row.capabilities.streaming ? "stream" : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"
                : "—"
            }
          />
          <KV
            k="Registry models"
            v={row.capabilities?.models?.length ? row.capabilities.models.join(", ") : "—"}
          />
          <KV k="Last tested" v={<ClientDateTime value={row.lastTestedAt} empty="never" />} />
          <KV k="Last test model" v={row.lastTestModel ?? "—"} />
          <KV k="JSON parse" v={row.lastTestJsonOk == null ? "—" : row.lastTestJsonOk ? "ok" : "failed"} />
          <KV k="Latency" v={row.lastTestLatencyMs == null ? "—" : `${row.lastTestLatencyMs}ms`} />
          {row.lastTestError && (
            <div className="col-span-full mt-1 text-bad">
              <span className="font-semibold uppercase tracking-wide text-[10px]">last error</span>:{" "}
              {row.lastTestError}
            </div>
          )}
          {row.notes && (
            <div className="col-span-full text-muted">
              <span className="font-semibold uppercase tracking-wide text-[10px]">notes</span>: {row.notes}
            </div>
          )}
          {row.lastTestRaw && (
            <details className="col-span-full rounded border border-border bg-bg/40 p-2">
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-muted">
                last raw output
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-muted">
                {row.lastTestRaw}
              </pre>
            </details>
          )}
        </div>
      )}

      {edit && (
        <div className="border-t border-border px-3 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Default model">
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink"
              >
                <option value="">Provider default</option>
                {defaultModelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="API key env var">
              <input
                value={apiKeyEnv}
                onChange={(e) => setApiKeyEnv(e.target.value)}
                placeholder="ANTHROPIC_API_KEY"
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 font-mono text-xs text-ink"
              />
            </Field>
            <Field label="Command (CLI providers)">
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink"
              />
            </Field>
            <Field label="Base URL (local providers)">
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink"
              />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-border bg-bg/65 p-2 text-xs text-ink"
              />
            </Field>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md border border-accent/70 bg-accent px-3 py-1 text-xs font-semibold text-cream shadow-glow disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEdit(false)}
              className="rounded-md border border-border bg-panel2 px-3 py-1 text-xs text-muted"
            >
              Cancel
            </button>
            {error && <span className="text-xs text-bad">{error}</span>}
          </div>
        </div>
      )}
      {!edit && error && <p className="border-t border-border px-3 py-1 text-xs text-bad">{error}</p>}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</label>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <span className="font-semibold uppercase tracking-wide text-[10px] text-muted">{k}</span>
      <div className="font-mono text-[11px] text-ink truncate">{v}</div>
    </div>
  );
}
