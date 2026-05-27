"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

type ProviderOption = {
  id: string;
  label: string;
  enabled: boolean;
  defaultModel: string | null;
  capabilities: { reasoning?: boolean; models?: string[] } | null;
  reasoningSupported: boolean;
};

type Row = {
  id: string;
  agentName: string;
  providerId: string;
  model: string;
  reasoningBudget: string;
  temperature: number;
  maxTokens: number;
  jsonMode: boolean;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  fallbackStrategy: string;
  timeoutMs: number;
  retryCount: number;
  enabled: boolean;
  costTier: string;
  qualityTier: string;
  updatedAt: string;
  reasoningMappingKind: string;
  reasoningMappingDetail: string;
};

export function AgentTable({
  rows,
  providers,
  reasoningBudgets,
  fallbackStrategies,
  costTiers,
  qualityTiers,
}: {
  rows: Row[];
  providers: ProviderOption[];
  reasoningBudgets: string[];
  fallbackStrategies: string[];
  costTiers: string[];
  qualityTiers: string[];
}) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <AgentRow
          key={r.id}
          row={r}
          providers={providers}
          reasoningBudgets={reasoningBudgets}
          fallbackStrategies={fallbackStrategies}
          costTiers={costTiers}
          qualityTiers={qualityTiers}
        />
      ))}
    </div>
  );
}

function AgentRow({
  row,
  providers,
  reasoningBudgets,
  fallbackStrategies,
  costTiers,
  qualityTiers,
}: {
  row: Row;
  providers: ProviderOption[];
  reasoningBudgets: string[];
  fallbackStrategies: string[];
  costTiers: string[];
  qualityTiers: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [providerId, setProviderId] = useState(row.providerId);
  const [model, setModel] = useState(row.model);
  const [reasoningBudget, setReasoningBudget] = useState(row.reasoningBudget);
  const [temperature, setTemperature] = useState(row.temperature);
  const [maxTokens, setMaxTokens] = useState(row.maxTokens);
  const [jsonMode, setJsonMode] = useState(row.jsonMode);
  const [fallbackProvider, setFallbackProvider] = useState<string>(row.fallbackProvider ?? "");
  const [fallbackModel, setFallbackModel] = useState<string>(row.fallbackModel ?? "");
  const [fallbackStrategy, setFallbackStrategy] = useState(row.fallbackStrategy);
  const [timeoutMs, setTimeoutMs] = useState(row.timeoutMs);
  const [retryCount, setRetryCount] = useState(row.retryCount);
  const [enabled, setEnabled] = useState(row.enabled);
  const [costTier, setCostTier] = useState(row.costTier);
  const [qualityTier, setQualityTier] = useState(row.qualityTier);
  const [error, setError] = useState<string | null>(null);

  const currentProvider = useMemo(
    () => providers.find((p) => p.id === providerId),
    [providers, providerId],
  );
  const reasoningSupported = !!currentProvider?.reasoningSupported;
  const models = currentProvider?.capabilities?.models ?? [];

  async function save() {
    setError(null);
    const body = {
      providerId,
      model,
      reasoningBudget,
      temperature,
      maxTokens,
      jsonMode,
      fallbackProvider: fallbackProvider || null,
      fallbackModel: fallbackModel || null,
      fallbackStrategy,
      timeoutMs,
      retryCount,
      enabled,
      costTier,
      qualityTier,
    };
    const resp = await fetch(`/api/admin/agents/${row.agentName}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      setError(data?.error ?? `HTTP ${resp.status}`);
      return;
    }
    setOpen(false);
    startTransition(() => router.refresh());
  }

  async function quickEnabledToggle() {
    setError(null);
    const next = !enabled;
    setEnabled(next);
    const resp = await fetch(`/api/admin/agents/${row.agentName}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (!resp.ok) {
      setEnabled(!next);
      setError(`HTTP ${resp.status}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="rounded-md border border-border bg-panel2/40">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
        <div className="flex items-center gap-3">
          <span className={`dot ${enabled ? "dot-completed" : "dot-pending"}`} />
          <code className="text-sm text-ink">{row.agentName}</code>
          <Badge tone="default">{providerId}</Badge>
          <code className="text-[11px] text-muted">{model}</code>
          <Badge
            tone={
              reasoningBudget === "high" || reasoningBudget === "max"
                ? "accent"
                : reasoningBudget === "none"
                ? "default"
                : "warn"
            }
          >
            reasoning: {reasoningBudget}
          </Badge>
          <Badge tone="default">
            {costTier} / {qualityTier}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={quickEnabledToggle}
            disabled={pending}
            className={`rounded-md border px-2 py-1 text-xs transition ${
              enabled ? "border-good/40 bg-good/10 text-good" : "border-border bg-panel2 text-muted"
            }`}
          >
            {enabled ? "Enabled" : "Disabled"}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-border bg-panel2 px-2 py-1 text-xs text-ink hover:border-accent/60 hover:text-accent"
          >
            {open ? "Close" : "Edit"}
          </button>
        </div>
      </div>

      {!open && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-[11px] sm:grid-cols-4">
          <KV k="Temperature" v={String(temperature)} />
          <KV k="Max tokens" v={String(maxTokens)} />
          <KV k="JSON mode" v={jsonMode ? "yes" : "no"} />
          <KV k="Timeout" v={`${timeoutMs}ms`} />
          <KV k="Retries" v={String(retryCount)} />
          <KV k="Fallback" v={`${fallbackProvider || "—"} / ${fallbackStrategy}`} />
          <KV k="Reasoning maps to" v={row.reasoningMappingDetail} />
          <KV k="Updated" v={new Date(row.updatedAt).toLocaleString()} />
        </div>
      )}

      {open && (
        <div className="border-t border-border px-3 py-3 text-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Provider">
              <select
                value={providerId}
                onChange={(e) => {
                  setProviderId(e.target.value);
                  const np = providers.find((p) => p.id === e.target.value);
                  if (np?.defaultModel) setModel(np.defaultModel);
                  if (np && !np.reasoningSupported) setReasoningBudget("none");
                }}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} {p.enabled ? "" : "(disabled)"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model">
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                list={`models-${row.agentName}`}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 font-mono text-xs text-ink"
              />
              <datalist id={`models-${row.agentName}`}>
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <Field label="Reasoning budget">
              <select
                value={reasoningBudget}
                onChange={(e) => setReasoningBudget(e.target.value)}
                disabled={!reasoningSupported}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink disabled:opacity-40"
              >
                {reasoningBudgets.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              {!reasoningSupported && (
                <p className="mt-1 text-[10px] text-muted">
                  Provider does not expose reasoning effort. Budget will be saved but ignored at runtime.
                </p>
              )}
            </Field>

            <Field label="Temperature">
              <input
                type="number"
                step={0.05}
                min={0}
                max={2}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value || "0"))}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink"
              />
            </Field>
            <Field label="Max tokens">
              <input
                type="number"
                min={64}
                max={64000}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value || "0", 10))}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink"
              />
            </Field>
            <Field label="JSON mode">
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-ink">
                <input
                  type="checkbox"
                  checked={jsonMode}
                  onChange={(e) => setJsonMode(e.target.checked)}
                  className="accent-accent"
                />
                Require strict JSON
              </label>
            </Field>

            <Field label="Fallback provider">
              <select
                value={fallbackProvider}
                onChange={(e) => setFallbackProvider(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink"
              >
                <option value="">— none —</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fallback model">
              <input
                value={fallbackModel}
                onChange={(e) => setFallbackModel(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 font-mono text-xs text-ink"
              />
            </Field>
            <Field label="Fallback strategy">
              <select
                value={fallbackStrategy}
                onChange={(e) => setFallbackStrategy(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink"
              >
                {fallbackStrategies.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Timeout (ms)">
              <input
                type="number"
                min={1000}
                max={600000}
                step={1000}
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(parseInt(e.target.value || "0", 10))}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink"
              />
            </Field>
            <Field label="Retry count">
              <input
                type="number"
                min={0}
                max={5}
                value={retryCount}
                onChange={(e) => setRetryCount(parseInt(e.target.value || "0", 10))}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink"
              />
            </Field>
            <Field label="Cost tier">
              <select
                value={costTier}
                onChange={(e) => setCostTier(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink"
              >
                {costTiers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quality tier">
              <select
                value={qualityTier}
                onChange={(e) => setQualityTier(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-bg/65 px-2 text-xs text-ink"
              >
                {qualityTiers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
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
              onClick={() => setOpen(false)}
              className="rounded-md border border-border bg-panel2 px-3 py-1 text-xs text-muted"
            >
              Cancel
            </button>
            {error && <span className="text-xs text-bad">{error}</span>}
          </div>
        </div>
      )}
      {!open && error && <p className="border-t border-border px-3 py-1 text-xs text-bad">{error}</p>}
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

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="font-semibold uppercase tracking-wide text-[10px] text-muted">{k}</span>
      <div className="font-mono text-[11px] text-ink truncate">{v}</div>
    </div>
  );
}
