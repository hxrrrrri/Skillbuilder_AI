"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusLight } from "@/components/ui/card";
import { Input, TextArea } from "@/components/ui/input";
import { ClientDateTime } from "@/components/ui/client-datetime";
import { cn } from "@/lib/utils";

type PromptRow = {
  id: string;
  agentName: string;
  version: number;
  system: string;
  instructions: string | null;
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
};

export function PromptAdmin({
  agentNames,
  versions,
}: {
  agentNames: string[];
  versions: PromptRow[];
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, PromptRow[]>();
    for (const agent of agentNames) map.set(agent, []);
    for (const row of versions) {
      const list = map.get(row.agentName) ?? [];
      list.push(row);
      map.set(row.agentName, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.version - a.version);
    return [...map.entries()];
  }, [agentNames, versions]);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {grouped.map(([agentName, rows]) => (
        <PromptCard key={agentName} agentName={agentName} rows={rows} />
      ))}
    </div>
  );
}

function PromptCard({ agentName, rows }: { agentName: string; rows: PromptRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const active = rows.find((r) => r.isActive) ?? rows[0] ?? null;
  const [system, setSystem] = useState(active?.system ?? "");
  const [instructions, setInstructions] = useState(active?.instructions ?? "");
  const [activateOnCreate, setActivateOnCreate] = useState(true);
  const [leftId, setLeftId] = useState(active?.id ?? rows[0]?.id ?? "");
  const [rightId, setRightId] = useState(rows.find((r) => r.id !== leftId)?.id ?? leftId);
  const [message, setMessage] = useState<string | null>(null);

  const left = rows.find((r) => r.id === leftId) ?? null;
  const right = rows.find((r) => r.id === rightId) ?? null;

  async function createVersion() {
    setMessage(null);
    const resp = await fetch("/api/admin/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_name: agentName,
        system,
        instructions: instructions || null,
        activate: activateOnCreate,
      }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      setMessage(data?.error ?? `HTTP ${resp.status}`);
      return;
    }
    setMessage("Saved new version.");
    startTransition(() => router.refresh());
  }

  async function activate(id: string) {
    setMessage(null);
    const resp = await fetch(`/api/admin/prompts/${id}/activate`, { method: "POST" });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      setMessage(data?.error ?? `HTTP ${resp.status}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-2xl border bg-panel/60 backdrop-blur-sm transition-all duration-300",
          active
            ? "border-border hover:border-good/30 hover:bg-panel/80"
            : "border-border/50 opacity-80 hover:opacity-100"
        )}
      >
        {/* ── Card header ── */}
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <StatusLight healthy={!!active} className="flex-shrink-0" />
            <code className="truncate text-sm font-semibold text-ink">{agentName}</code>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
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
          {active ? (
            <Badge tone="good">active v{active.version}</Badge>
          ) : (
            <Badge tone="warn">no prompt</Badge>
          )}
          {active?.system ? (
            <Badge tone="default">{active.system.length} chars</Badge>
          ) : (
            <Badge tone="warn">no inline prompt</Badge>
          )}
          <Badge tone="default">{rows.length} version{rows.length !== 1 ? "s" : ""}</Badge>
        </div>

        {/* ── Metrics grid ── */}
        <div className="mt-auto grid grid-cols-3 border-t border-border">
          {[
            { k: "VERSIONS", v: String(rows.length) },
            { k: "ACTIVE", v: active ? `v${active.version}` : "—" },
            { k: "CHARS", v: active ? String(active.system.length) : "0" },
          ].map(({ k, v }) => (
            <div key={k} className="px-3 py-3 text-center">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted/60">{k}</div>
              <div className="mt-1 font-mono text-sm font-medium text-ink">{v}</div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-border px-4 py-2">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted/50">Latest </span>
          <span className="font-mono text-[11px] text-muted">
            {rows[0] ? <ClientDateTime value={rows[0].createdAt} /> : "—"}
          </span>
        </div>
      </div>

      {/* ── Edit modal ── */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <code className="text-sm font-semibold text-ink">{agentName}</code>
                <p className="mt-0.5 text-[11px] text-muted">Prompt configuration</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-lg leading-none text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="space-y-6 p-5">
              {/* ── New version ── */}
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  New version
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <TextArea
                      value={system}
                      onChange={(e) => setSystem(e.target.value)}
                      maxLength={10000}
                      className="min-h-[220px] font-mono text-xs"
                    />
                    <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                      <Input
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        maxLength={10000}
                        placeholder="Optional instructions"
                        className="h-9 text-xs"
                      />
                      <label className="inline-flex items-center gap-2 rounded-xl border border-border px-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={activateOnCreate}
                          onChange={(e) => setActivateOnCreate(e.target.checked)}
                          className="accent-accent"
                        />
                        Activate
                      </label>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={createVersion}
                        disabled={pending || system.length > 10000}
                      >
                        Save new version
                      </Button>
                      <span className="text-[11px] text-muted">{system.length}/10000</span>
                      {message && <span className="text-xs text-muted">{message}</span>}
                    </div>
                  </div>

                  {/* ── Diff ── */}
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Diff
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        value={leftId}
                        onChange={(e) => setLeftId(e.target.value)}
                        className="h-9 rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                      >
                        {rows.map((r) => (
                          <option key={r.id} value={r.id}>
                            v{r.version}{r.isActive ? " active" : ""}
                          </option>
                        ))}
                      </select>
                      <select
                        value={rightId}
                        onChange={(e) => setRightId(e.target.value)}
                        className="h-9 rounded-xl border border-border bg-bg/65 px-2 text-xs text-ink"
                      >
                        {rows.map((r) => (
                          <option key={r.id} value={r.id}>
                            v{r.version}{r.isActive ? " active" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    {left && right ? (
                      <pre className="mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-bg/50 p-3 text-[11px] text-muted">
                        {simpleDiff(left.system, right.system)}
                      </pre>
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        Create at least one version to compare.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Versions list ── */}
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Versions
                </div>
                <div className="divide-y divide-border rounded-xl border border-border">
                  {rows.length === 0 ? (
                    <div className="p-3 text-xs text-muted">
                      No prompt versions seeded for this agent.
                    </div>
                  ) : (
                    rows.map((row) => (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Badge tone={row.isActive ? "good" : "default"}>v{row.version}</Badge>
                          <span className="text-muted">
                            <ClientDateTime value={row.createdAt} />
                          </span>
                          <span className="font-mono text-muted">{row.system.length} chars</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSystem(row.system);
                              setInstructions(row.instructions ?? "");
                            }}
                          >
                            Prefill
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => activate(row.id)}
                            disabled={pending || row.isActive}
                          >
                            Activate
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function simpleDiff(left: string, right: string): string {
  const a = left.split(/\r?\n/);
  const b = right.split(/\r?\n/);
  const max = Math.max(a.length, b.length);
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    const l = a[i];
    const r = b[i];
    if (l === r) {
      if (l !== undefined) out.push(`  ${l}`);
    } else {
      if (l !== undefined) out.push(`- ${l}`);
      if (r !== undefined) out.push(`+ ${r}`);
    }
  }
  return out.join("\n");
}
