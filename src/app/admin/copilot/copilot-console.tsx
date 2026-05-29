"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

type RiskLevel = "read" | "write_safe" | "write_sensitive" | "destructive" | "forbidden";

type ToolPlan = {
  intent: string;
  affected: string[];
  before: unknown;
  after: unknown;
  risks: string[];
  rollback: string;
};

type Proposal = {
  toolCallId: string;
  toolName: string;
  riskLevel: RiskLevel;
  plan: ToolPlan;
  requiresTypedConfirmation: boolean;
  confirmationPhrase?: string;
  expiresAt: string;
};

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  providerId?: string;
  model?: string;
  citations?: string[];
  toolResult?: { toolName: string; data: unknown } | null;
  proposal?: Proposal | null;
  refusal?: { toolName: string; reason: string; fix?: string; route?: string } | null;
  error?: boolean;
};

type SessionRow = { id: string; mode: string; title: string; updatedAt: string };
type ToolRow = { name: string; risk: RiskLevel; mode: string; title: string; description: string };
type ProviderChoice = {
  providerId: string;
  label?: string;
  enabled?: boolean;
  defaultModel?: string | null;
  lastTestStatus?: string | null;
  lastTestJsonOk?: boolean | null;
};

const RISK_BADGE: Record<RiskLevel, string> = {
  read: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  write_safe: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  write_sensitive: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  destructive: "border-red-500/40 bg-red-500/10 text-red-300",
  forbidden: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
};

const SUGGESTED = [
  "Show students whose profiles have been created",
  "List all public profiles with candidate details",
  "Search candidates with completed runs",
  "Give platform overview",
  "Explain where student/profile data is stored",
  "Explain SkillProof dataflow from verification run to public profile",
  "Show candidates with score above 70",
  "Show private profiles that are not published",
];

function uid() {
  return Math.random().toString(36).slice(2);
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", RISK_BADGE[risk])}>
      {risk.replace("_", " ")}
    </span>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function collectRoutes(value: unknown, out = new Set<string>()): string[] {
  if (typeof value === "string" && value.startsWith("/") && !value.includes("[")) out.add(value);
  else if (Array.isArray(value)) value.forEach((v) => collectRoutes(v, out));
  else if (isRecord(value)) Object.values(value).forEach((v) => collectRoutes(v, out));
  return Array.from(out);
}

function flattenForTable(value: unknown, prefix = ""): Record<string, string> {
  if (!isRecord(value)) return { value: String(value ?? "—") };
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === null || raw === undefined) continue;
    const label = prefix ? `${prefix}.${key}` : key;
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      out[label] = String(raw);
    } else if (isRecord(raw)) {
      for (const [childKey, childValue] of Object.entries(raw)) {
        if (typeof childValue === "string" || typeof childValue === "number" || typeof childValue === "boolean") {
          out[`${label}.${childKey}`] = String(childValue);
        }
      }
    }
  }
  return out;
}

function pickRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  if (Array.isArray(data.items)) return data.items;
  if (isRecord(data.detail) && Array.isArray(data.detail.students)) return data.detail.students;
  return [];
}

function ToolResultView({ toolResult }: { toolResult: { toolName: string; data: unknown } }) {
  const data = toolResult.data as any;
  const rows = pickRows(toolResult.data);
  const noData = isRecord(data) && data.ok === true && (data.count === 0 || (Array.isArray(data.items) && data.items.length === 0));
  const flattened = rows.slice(0, 8).map((r) => flattenForTable(r));
  const headers = Array.from(new Set(flattened.flatMap((r) => Object.keys(r)))).slice(0, 8);
  const routes = collectRoutes(toolResult.data);

  return (
    <div className="rounded-md border border-border bg-bg/40 px-3 py-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-2 text-muted">
        <span>tool used</span>
        <code className="text-ink">{toolResult.toolName}</code>
        {typeof data?.count === "number" && <span>· {data.count} result{data.count === 1 ? "" : "s"}</span>}
      </div>

      {noData && <p className="mt-2 rounded border border-zinc-600/40 bg-zinc-700/10 px-2 py-1 text-muted">No matching data found.</p>}

      {headers.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-border text-muted">
                {headers.map((h) => (
                  <th key={h} className="max-w-[10rem] truncate py-1 pr-3 font-medium">
                    {h.replace(/^candidate\./, "").replace(/^profile\./, "profile ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {flattened.map((row, i) => (
                <tr key={i}>
                  {headers.map((h) => (
                    <td key={h} className="max-w-[12rem] truncate py-1 pr-3 text-ink" title={row[h]}>
                      {row[h] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 8 && <p className="mt-1 text-[11px] text-muted">Showing first 8 structured rows.</p>}
        </div>
      )}

      {routes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {routes.slice(0, 12).map((route) => (
            <a key={route} href={route} className="rounded border border-border bg-panel2 px-1.5 py-0.5 font-mono text-[10px] text-accent hover:border-accent/60">
              {route}
            </a>
          ))}
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-muted">JSON debug</summary>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-[11px] text-ink">
          {JSON.stringify(toolResult.data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function CopilotConsole({ role }: { role: string }) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [providers, setProviders] = useState<ProviderChoice[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [resolved, setResolved] = useState<Record<string, { status: string; detail?: string }>>({});
  const [confirmText, setConfirmText] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    const data = await fetch("/api/chat/sessions").then((r) => r.json()).catch(() => ({ sessions: [] }));
    setSessions((data.sessions ?? []).filter((s: SessionRow) => s.mode === "admin"));
  }, []);

  const newSession = useCallback(async () => {
    const res = await fetch("/api/chat/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "admin", title: "Command Copilot" }),
    });
    const data = await res.json();
    if (data?.session?.id) {
      setSessionId(data.session.id);
      setMessages([]);
      setResolved({});
      await loadSessions();
    }
  }, [loadSessions]);

  const openSession = useCallback(async (id: string) => {
    setSessionId(id);
    setResolved({});
    const data = await fetch(`/api/chat/sessions/${id}`).then((r) => r.json()).catch(() => null);
    const msgs: Msg[] = (data?.session?.messages ?? [])
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => {
        let meta: any = {};
        try {
          meta = m.metadataJson ? JSON.parse(m.metadataJson) : {};
        } catch {
          /* ignore */
        }
        return { id: m.id, role: m.role, content: m.content, providerId: meta.providerId, model: meta.model, citations: meta.citations };
      });
    setMessages(msgs);
  }, []);

  useEffect(() => {
    loadSessions();
    fetch("/api/admin/copilot/tools").then((r) => r.json()).then((d) => setTools(d.tools ?? [])).catch(() => {});
    fetch("/api/admin/copilot/context?page=/admin/copilot")
      .then((r) => r.json())
      .then((d) => setProviders(d.context?.providerRegistry?.providers ?? []))
      .catch(() => {});
  }, [loadSessions]);

  useEffect(() => {
    if (!sessionId && sessions.length === 0) newSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      let sid = sessionId;
      if (!sid) {
        await newSession();
        sid = sessionId;
      }
      if (!sid) return;
      setInput("");
      setMessages((m) => [...m, { id: uid(), role: "user", content: message }]);
      setBusy(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            session_id: sid,
            message,
            mode: "admin",
            page: "/admin/copilot",
            provider_id: selectedProvider || null,
          }),
        });
        const data = await res.json();
        if (res.status === 409 && data?.error === "provider_not_ready") {
          setMessages((m) => [
            ...m,
            { id: uid(), role: "assistant", error: true, content: `No ready provider. ${data.fix ?? ""} (${data.route ?? ""})` },
          ]);
        } else if (!res.ok) {
          setMessages((m) => [
            ...m,
            { id: uid(), role: "assistant", error: true, content: data?.message || data?.error || "Request failed." },
          ]);
        } else {
          setMessages((m) => [
            ...m,
            {
              id: uid(),
              role: "assistant",
              content: data.reply,
              providerId: data.providerId,
              model: data.model,
              citations: data.citations,
              toolResult: data.toolResult,
              proposal: data.proposal,
              refusal: data.refusal,
            },
          ]);
        }
      } catch {
        setMessages((m) => [...m, { id: uid(), role: "assistant", error: true, content: "Network error." }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, sessionId, newSession, selectedProvider],
  );

  const resolve = useCallback(
    async (proposal: Proposal, action: "approve" | "reject") => {
      const body =
        action === "approve" && proposal.requiresTypedConfirmation
          ? { approval_text: confirmText[proposal.toolCallId] ?? "" }
          : {};
      const res = await fetch(`/api/chat/tool-calls/${proposal.toolCallId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        setResolved((r) => ({ ...r, [proposal.toolCallId]: { status: "error", detail: data?.message || data?.code || "failed" } }));
        return;
      }
      setResolved((r) => ({
        ...r,
        [proposal.toolCallId]: {
          status: action === "approve" ? "executed" : "rejected",
          detail: action === "approve" ? JSON.stringify(data.result) : undefined,
        },
      }));
      loadSessions();
    },
    [confirmText, loadSessions],
  );

  const pendingApprovals = messages
    .filter((m) => m.proposal && !resolved[m.proposal.toolCallId])
    .map((m) => m.proposal!) as Proposal[];

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_1fr_18rem]">
      {/* Left: sessions */}
      <Card className="hidden lg:block">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-sm">Sessions</CardTitle>
          <button onClick={newSession} className="rounded border border-border px-2 py-1 text-[11px] text-muted hover:text-ink">
            + New
          </button>
        </CardHeader>
        <CardBody className="space-y-1">
          {sessions.length === 0 && <p className="text-xs text-muted">No sessions yet.</p>}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => openSession(s.id)}
              className={cn(
                "block w-full truncate rounded px-2 py-1.5 text-left text-xs transition",
                s.id === sessionId ? "bg-panel2 text-ink" : "text-muted hover:bg-bg/60 hover:text-ink",
              )}
            >
              {s.title}
            </button>
          ))}
        </CardBody>
      </Card>

      {/* Main: chat */}
      <Card className="flex min-h-[34rem] flex-col">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-sm">Chat</CardTitle>
          <span className="text-[11px] text-muted">role: {role}</span>
        </CardHeader>
        <CardBody className="flex flex-1 flex-col gap-3">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1 text-sm" style={{ maxHeight: "26rem" }}>
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted">Try:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      className="rounded-md border border-border bg-bg/60 px-2 py-1 text-[11px] text-muted hover:border-accent/60 hover:text-ink"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="space-y-2">
                <div className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-5",
                      m.role === "user"
                        ? "bg-accent/20 text-ink"
                        : m.error
                          ? "border border-red-500/40 bg-red-500/10 text-ink"
                          : "border border-border bg-bg/60 text-ink",
                    )}
                  >
                    {m.content}
                    {m.role === "assistant" && m.providerId && (
                      <div className="mt-1 text-[10px] text-muted">
                        {m.providerId} · {m.model}
                      </div>
                    )}
                    {m.citations && m.citations.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.citations.map((c) => (
                          <span key={c} className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] text-muted">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {m.refusal && (
                  <div className="rounded-md border border-zinc-600/40 bg-zinc-700/10 px-3 py-2 text-[12px] text-muted">
                    Refused <code className="text-ink">{m.refusal.toolName}</code>: {m.refusal.reason}
                    {m.refusal.fix ? ` — ${m.refusal.fix}` : ""}
                  </div>
                )}

                {m.toolResult && <ToolResultView toolResult={m.toolResult} />}

                {m.proposal && (
                  <ProposalCard
                    proposal={m.proposal}
                    resolved={resolved[m.proposal.toolCallId]}
                    confirmText={confirmText[m.proposal.toolCallId] ?? ""}
                    onConfirmTextChange={(v) => setConfirmText((c) => ({ ...c, [m.proposal!.toolCallId]: v }))}
                    onApprove={() => resolve(m.proposal!, "approve")}
                    onReject={() => resolve(m.proposal!, "reject")}
                  />
                )}
              </div>
            ))}
            {busy && <p className="text-xs text-muted">Thinking…</p>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-border pt-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the copilot or request an action…"
              className="flex-1 rounded-md border border-border bg-bg/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent/60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-md border border-accent/50 bg-accent/15 px-3 py-2 text-[12px] font-medium text-ink hover:border-accent disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </CardBody>
      </Card>

      {/* Right: context / tools / pending */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Chat provider</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full rounded-md border border-border bg-bg/60 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/60"
            >
              <option value="">Auto: first healthy provider</option>
              {providers.map((p) => {
                const ready = p.enabled !== false && p.lastTestStatus === "ok" && p.lastTestJsonOk === true;
                return (
                  <option key={p.providerId} value={p.providerId}>
                    {p.label ?? p.providerId} {ready ? "ready" : "not ready"}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-muted">
              A pinned provider must be enabled and have a passing JSON health test; otherwise the copilot fails closed.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending approvals</CardTitle>
          </CardHeader>
          <CardBody>
            {pendingApprovals.length === 0 ? (
              <p className="text-xs text-muted">No pending approvals.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {pendingApprovals.map((p) => (
                  <li key={p.toolCallId} className="flex items-center justify-between gap-2">
                    <code className="truncate text-ink">{p.toolName}</code>
                    <RiskBadge risk={p.riskLevel} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tools ({tools.length})</CardTitle>
          </CardHeader>
          <CardBody className="max-h-80 space-y-1.5 overflow-y-auto">
            {tools.map((t) => (
              <div key={t.name} className="flex items-start justify-between gap-2 border-b border-border/50 pb-1.5">
                <div className="min-w-0">
                  <code className="block truncate text-[11px] text-ink">{t.name}</code>
                  <p className="text-[10px] text-muted">{t.title}</p>
                </div>
                <RiskBadge risk={t.risk} />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  resolved,
  confirmText,
  onConfirmTextChange,
  onApprove,
  onReject,
}: {
  proposal: Proposal;
  resolved?: { status: string; detail?: string };
  confirmText: string;
  onConfirmTextChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="font-medium text-ink">Proposed action</span>
        <RiskBadge risk={proposal.riskLevel} />
      </div>
      <p className="mt-1 text-ink">{proposal.plan.intent}</p>
      <p className="mt-1 text-muted">
        Affected: {proposal.plan.affected.slice(0, 8).join(", ") || "—"}
        {proposal.plan.affected.length > 8 ? ` (+${proposal.plan.affected.length - 8})` : ""}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Before</p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-bg/60 p-1 text-[10px] text-ink">
            {JSON.stringify(proposal.plan.before, null, 2)}
          </pre>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">After</p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-bg/60 p-1 text-[10px] text-ink">
            {JSON.stringify(proposal.plan.after, null, 2)}
          </pre>
        </div>
      </div>
      {proposal.plan.risks.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-[11px] text-amber-200/80">
          {proposal.plan.risks.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[11px] text-muted">Rollback: {proposal.plan.rollback}</p>

      {resolved ? (
        <p
          className={cn(
            "mt-2 text-[12px]",
            resolved.status === "executed" ? "text-emerald-300" : resolved.status === "rejected" ? "text-muted" : "text-red-300",
          )}
        >
          {resolved.status === "executed"
            ? `Executed. ${resolved.detail ?? ""}`
            : resolved.status === "rejected"
              ? "Rejected."
              : `Error: ${resolved.detail ?? ""}`}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {proposal.requiresTypedConfirmation && (
            <input
              value={confirmText}
              onChange={(e) => onConfirmTextChange(e.target.value)}
              placeholder={`Type: ${proposal.confirmationPhrase}`}
              className="w-full rounded border border-red-500/40 bg-bg/60 px-2 py-1 text-[11px] text-ink outline-none"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={onApprove}
              className="rounded border border-emerald-500/50 bg-emerald-500/15 px-3 py-1 text-[12px] text-emerald-200 hover:border-emerald-400"
            >
              Approve
            </button>
            <button
              onClick={onReject}
              className="rounded border border-border px-3 py-1 text-[12px] text-muted hover:text-ink"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
