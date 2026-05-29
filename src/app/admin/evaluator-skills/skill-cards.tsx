"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SkillRow = {
  id: string;
  name: string;
  slug: string;
  version: string;
  category: string;
  enabled: boolean;
  riskLevel: string;
  toolPermissionsJson: string | null;
  requiredInputsJson: string | null;
  outputSchemaJson: string | null;
  runCount: number;
  lastFailure?: { createdAt: Date; error: string | null } | null;
};

function safeJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export function SkillCards({ skills }: { skills: SkillRow[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {skills.map((s) => (
        <SkillCard key={s.id} skill={s} />
      ))}
    </div>
  );
}

function SkillCard({ skill }: { skill: SkillRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(skill.enabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const tools = safeJson<Record<string, string>>(skill.toolPermissionsJson, {});
  const inputs = safeJson<string[]>(skill.requiredInputsJson, []);
  const output = safeJson<{ produces?: string[] }>(skill.outputSchemaJson, {});

  const riskTone = skill.riskLevel === "low" ? "good" : "warn";

  async function toggleEnabled() {
    setError(null);
    const next = !enabled;
    setEnabled(next);
    try {
      const resp = await fetch(`/api/admin/evaluator-skills/${skill.id}`, {
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
    } catch (err: any) {
      setEnabled(!next);
      setError(err?.message ?? "Network error");
    }
  }

  async function saveFromModal(next: boolean) {
    setError(null);
    try {
      const resp = await fetch(`/api/admin/evaluator-skills/${skill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setError(data?.error ?? `HTTP ${resp.status}`);
        return;
      }
      setEnabled(next);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    }
  }

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
            <span className={cn("dot flex-shrink-0", enabled ? "dot-alive" : "dot-disabled")} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{skill.name}</div>
              <code className="font-mono text-[11px] text-muted">{skill.slug}</code>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={toggleEnabled}
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
          <Badge tone="default">{skill.category}</Badge>
          <Badge tone="default">v{skill.version}</Badge>
          <Badge tone={riskTone}>risk: {skill.riskLevel}</Badge>
        </div>

        {/* ── Metrics grid ── */}
        <div className="mt-auto grid grid-cols-3 divide-x divide-border border-t border-border">
          {[
            { k: "RUNS", v: String(skill.runCount) },
            { k: "INPUTS", v: String(inputs.length) },
            { k: "TOOLS", v: String(Object.keys(tools).length) },
          ].map(({ k, v }) => (
            <div key={k} className="bg-panel2/20 px-3 py-3 text-center">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/60">{k}</div>
              <div className="mt-1 font-mono text-sm font-medium text-ink">{v}</div>
            </div>
          ))}
        </div>

        {/* ── Footer strip ── */}
        <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
          <div className="px-4 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">Outputs</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
              {output.produces?.join(", ") || "—"}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">Last failure</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
              {skill.lastFailure
                ? skill.lastFailure.createdAt.toISOString().slice(0, 10)
                : "none"}
            </div>
          </div>
        </div>

        {error && (
          <p className="border-t border-border px-4 py-2 text-xs text-bad">{error}</p>
        )}
      </div>

      {/* ── Edit modal ── */}
      {open && (
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
                <p className="text-sm font-semibold text-ink">{skill.name}</p>
                <code className="mt-0.5 font-mono text-[11px] text-muted">{skill.slug}</code>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-lg leading-none text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 p-5 text-xs">
              {/* ── Details ── */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border/60 bg-panel2/40 p-4 sm:grid-cols-3">
                <KV k="Version" v={`v${skill.version}`} />
                <KV k="Category" v={skill.category} />
                <KV k="Risk level" v={skill.riskLevel} />
                <KV k="Total runs" v={String(skill.runCount)} />
                <KV
                  k="Last failure"
                  v={
                    skill.lastFailure
                      ? `${skill.lastFailure.createdAt.toISOString().slice(0, 10)} · ${skill.lastFailure.error ?? "failed"}`
                      : "none"
                  }
                />
              </div>

              {inputs.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Required inputs
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {inputs.map((i) => (
                      <span
                        key={i}
                        className="rounded-lg border border-border/60 bg-panel2/60 px-2 py-0.5 font-mono text-[10px] text-muted"
                      >
                        {i}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(tools).length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Tool permissions
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(tools).map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded-lg border border-border/60 bg-panel2/60 px-2 py-0.5 font-mono text-[10px] text-muted"
                      >
                        {k}:{String(v)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(output.produces ?? []).length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Produces
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(output.produces ?? []).map((p) => (
                      <span
                        key={p}
                        className="rounded-lg border border-border/60 bg-panel2/60 px-2 py-0.5 font-mono text-[10px] text-muted"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Enabled toggle ── */}
              <div className="border-t border-border pt-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Status
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => saveFromModal(true)}
                    disabled={pending || enabled}
                    className={cn(
                      "rounded-xl border px-4 py-1.5 text-xs font-semibold transition-all",
                      enabled
                        ? "border-good/35 bg-good/10 text-good cursor-default"
                        : "border-border bg-panel2 text-muted hover:border-good/35 hover:text-good"
                    )}
                  >
                    Enable
                  </button>
                  <button
                    type="button"
                    onClick={() => saveFromModal(false)}
                    disabled={pending || !enabled}
                    className={cn(
                      "rounded-xl border px-4 py-1.5 text-xs font-semibold transition-all",
                      !enabled
                        ? "border-bad/35 bg-bad/10 text-bad cursor-default"
                        : "border-border bg-panel2 text-muted hover:border-bad/35 hover:text-bad"
                    )}
                  >
                    Disable
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-border bg-panel2 px-4 py-1.5 text-xs text-muted hover:text-ink"
                  >
                    Close
                  </button>
                </div>
                {error && <p className="mt-2 text-xs text-bad">{error}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/60">{k}</div>
      <div className="mt-0.5 font-mono text-[11px] text-ink">{v}</div>
    </div>
  );
}
