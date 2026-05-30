"use client";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { StatusLight } from "@/components/ui/card";
import { ClientDateTime } from "@/components/ui/client-datetime";
import { cn } from "@/lib/utils";

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
  const [providerOptions, setProviderOptions] = useState(providers);

  useEffect(() => {
    setProviderOptions(providers);
  }, [providers]);

  const refreshProviderModels = useCallback(async () => {
    const resp = await fetch("/api/admin/providers?live=1", { cache: "no-store" });
    if (!resp.ok) return;
    const data = await resp.json().catch(() => null);
    if (!Array.isArray(data?.providers)) return;
    setProviderOptions((current) => {
      const byId = new Map(current.map((p) => [p.id, p]));
      for (const p of data.providers) {
        if (!p?.providerId) continue;
        const existing = byId.get(p.providerId);
        byId.set(p.providerId, {
          id: p.providerId,
          label: p.label ?? existing?.label ?? p.providerId,
          enabled: p.enabled ?? existing?.enabled ?? false,
          defaultModel: p.defaultModel ?? existing?.defaultModel ?? null,
          capabilities: {
            ...(existing?.capabilities ?? {}),
            ...(p.capabilities ?? {}),
            models: Array.isArray(p.capabilities?.models)
              ? p.capabilities.models.filter((m: unknown): m is string => typeof m === "string")
              : existing?.capabilities?.models ?? [],
          },
          reasoningSupported: existing?.reasoningSupported ?? !!p.capabilities?.reasoning,
        });
      }
      return Array.from(byId.values());
    });
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <AgentRow
          key={r.id}
          row={r}
          providers={providerOptions}
          refreshProviderModels={refreshProviderModels}
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
  refreshProviderModels,
  reasoningBudgets,
  fallbackStrategies,
  costTiers,
  qualityTiers,
}: {
  row: Row;
  providers: ProviderOption[];
  refreshProviderModels: () => Promise<void>;
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
  const [modelsRefreshing, setModelsRefreshing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setModelsRefreshing(true);
    refreshProviderModels()
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? "Could not refresh live provider models");
      })
      .finally(() => {
        if (!cancelled) setModelsRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, refreshProviderModels]);

  const currentProvider = useMemo(
    () => providers.find((p) => p.id === providerId),
    [providers, providerId],
  );
  const reasoningSupported = !!currentProvider?.reasoningSupported;
  const models = useMemo(() => {
    const listed = currentProvider?.capabilities?.models ?? [];
    return model && !listed.includes(model) ? [model, ...listed] : listed;
  }, [currentProvider, model]);
  const fallbackProviderOption = useMemo(
    () => providers.find((p) => p.id === fallbackProvider),
    [providers, fallbackProvider],
  );
  const fallbackModels = useMemo(() => {
    const listed = fallbackProviderOption?.capabilities?.models ?? [];
    return fallbackModel && !listed.includes(fallbackModel) ? [fallbackModel, ...listed] : listed;
  }, [fallbackProviderOption, fallbackModel]);

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
    try {
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
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    }
  }

  async function quickEnabledToggle() {
    setError(null);
    const next = !enabled;
    setEnabled(next);
    try {
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
    } catch (err: any) {
      setEnabled(!next);
      setError(err?.message ?? "Network error");
    }
  }

  const reasoningTone =
    reasoningBudget === "high" || reasoningBudget === "max"
      ? "accent"
      : reasoningBudget === "none"
      ? "default"
      : "warn";

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
            <StatusLight healthy={enabled} className="flex-shrink-0" />
            <code className="truncate text-sm font-semibold text-ink">{row.agentName}</code>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={quickEnabledToggle}
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
              onClick={() => setOpen(true)}
              className="rounded-lg border border-border bg-panel2 px-2.5 py-1 text-[11px] text-ink transition-all hover:border-accent/60 hover:text-accent"
            >
              Edit
            </button>
          </div>
        </div>

        {/* ── Badge strip ── */}
        <div className="flex flex-wrap gap-1.5 px-5 pb-4">
          <Badge tone="default">{providerId}</Badge>
          <code className="inline-flex items-center rounded-lg border border-border/60 bg-panel2/60 px-2 py-0.5 font-mono text-[10px] text-muted">
            {model}
          </code>
          <Badge tone={reasoningTone}>reasoning: {reasoningBudget}</Badge>
          <Badge tone="default">
            {costTier} / {qualityTier}
          </Badge>
        </div>

        {/* ── Metrics grid ── */}
        <div className="mt-auto grid grid-cols-4 border-t border-border">
          {[
            { k: "TEMP", v: String(temperature) },
            { k: "TOKENS", v: String(maxTokens) },
            { k: "TIMEOUT", v: `${timeoutMs / 1000}s` },
            { k: "RETRIES", v: String(retryCount) },
          ].map(({ k, v }) => (
            <div key={k} className="px-3 py-3 text-center">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/60">{k}</div>
              <div className="mt-1 font-mono text-sm font-medium text-ink">{v}</div>
            </div>
          ))}
        </div>

        {/* ── Footer strip ── */}
        <div className="grid grid-cols-2 border-t border-border">
          <div className="px-4 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">Fallback</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
              {fallbackProvider || "—"} / {fallbackStrategy}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">Reasoning → </div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-accent/80">
              {row.reasoningMappingDetail}
            </div>
          </div>
        </div>

        {/* ── Updated row ── */}
        <div className="border-t border-border px-4 py-2">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">Updated </span>
          <span className="font-mono text-[11px] text-muted">
            <ClientDateTime value={row.updatedAt} />
          </span>
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
                <code className="text-sm font-semibold text-ink">{row.agentName}</code>
                <p className="mt-0.5 text-[11px] text-muted">Agent configuration</p>
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
                <Field label="Provider">
                  <select
                    value={providerId}
                    onChange={(e) => {
                      setProviderId(e.target.value);
                      const np = providers.find((p) => p.id === e.target.value);
                      setModel(np?.defaultModel || np?.capabilities?.models?.[0] || "");
                      if (np && !np.reasoningSupported) setReasoningBudget("none");
                      setModelsRefreshing(true);
                      refreshProviderModels().finally(() => setModelsRefreshing(false));
                    }}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} {p.enabled ? "" : "(disabled)"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Model">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 font-mono text-xs text-ink"
                  >
                    {models.length === 0 && <option value="">No live models found</option>}
                    {models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-muted">
                    {modelsRefreshing ? "Refreshing live model list…" : `${models.length} live/catalog model${models.length === 1 ? "" : "s"}`}
                  </p>
                </Field>
                <Field label="Reasoning budget">
                  <select
                    value={reasoningBudget}
                    onChange={(e) => setReasoningBudget(e.target.value)}
                    disabled={!reasoningSupported}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink disabled:opacity-40"
                  >
                    {reasoningBudgets.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  {!reasoningSupported && (
                    <p className="mt-1 text-[10px] text-muted">Provider does not expose reasoning effort.</p>
                  )}
                </Field>
                <Field label="Temperature">
                  <input
                    type="number" step={0.05} min={0} max={2}
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value || "0"))}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                  />
                </Field>
                <Field label="Max tokens">
                  <input
                    type="number" min={64} max={64000}
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value || "0", 10))}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                  />
                </Field>
                <Field label="JSON mode">
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-ink">
                    <input type="checkbox" checked={jsonMode} onChange={(e) => setJsonMode(e.target.checked)} className="accent-accent" />
                    Require strict JSON
                  </label>
                </Field>
                <Field label="Fallback provider">
                  <select
                    value={fallbackProvider}
                    onChange={(e) => {
                      const next = e.target.value;
                      setFallbackProvider(next);
                      const np = providers.find((p) => p.id === next);
                      setFallbackModel(next ? np?.defaultModel || np?.capabilities?.models?.[0] || "" : "");
                    }}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                  >
                    <option value="">— none —</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Fallback model">
                  <select
                    value={fallbackModel}
                    onChange={(e) => setFallbackModel(e.target.value)}
                    disabled={!fallbackProvider}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 font-mono text-xs text-ink disabled:opacity-40"
                  >
                    <option value="">No fallback model</option>
                    {fallbackModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Fallback strategy">
                  <select
                    value={fallbackStrategy}
                    onChange={(e) => setFallbackStrategy(e.target.value)}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                  >
                    {fallbackStrategies.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Timeout (ms)">
                  <input
                    type="number" min={1000} max={600000} step={1000}
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(parseInt(e.target.value || "0", 10))}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                  />
                </Field>
                <Field label="Retry count">
                  <input
                    type="number" min={0} max={5}
                    value={retryCount}
                    onChange={(e) => setRetryCount(parseInt(e.target.value || "0", 10))}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                  />
                </Field>
                <Field label="Cost tier">
                  <select
                    value={costTier}
                    onChange={(e) => setCostTier(e.target.value)}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                  >
                    {costTiers.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Quality tier">
                  <select
                    value={qualityTier}
                    onChange={(e) => setQualityTier(e.target.value)}
                    className="mt-1 h-8 w-full rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                  >
                    {qualityTiers.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
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
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</label>
      {children}
    </div>
  );
}
