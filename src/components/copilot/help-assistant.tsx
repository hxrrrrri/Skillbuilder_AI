"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Citation = string;
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  toolResult?: { toolName: string; data: unknown } | null;
  refusal?: { reason: string; fix?: string } | null;
  error?: boolean;
};

const QUICK_PROMPTS_BY_ROLE: Record<string, string[]> = {
  candidate: [
    "How do I use SkillProof AI?",
    "How do I prove I own my repo?",
    "What does not_measured mean?",
    "How do I publish my profile?",
  ],
  employer: [
    "How do I use SkillProof AI?",
    "How do I compare candidates?",
    "What is an employer-safe report?",
    "How do interview kits work?",
  ],
  college_admin: ["How do I use SkillProof AI?", "How do cohorts work?", "Where are skill gaps shown?"],
  college_member: ["How do I use SkillProof AI?", "How do cohorts work?", "Where are skill gaps shown?"],
  admin: ["How do I use SkillProof AI?", "Explain verification steps", "What is the AI collaboration challenge?"],
  anonymous: [
    "What is SkillProof AI?",
    "How does verification work?",
    "What is proof-of-work hiring?",
  ],
};

export function HelpAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>("anonymous");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Don't duplicate the assistant on the full admin Command Copilot page.
  const hidden = pathname?.startsWith("/admin/copilot");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch("/api/me").then((r) => r.json());
        if (!cancelled && me?.user?.role) setRole(me.user.role);
      } catch {
        /* anonymous */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "help", title: "Help" }),
      });
      const data = await res.json();
      if (data?.session?.id) {
        setSessionId(data.session.id);
        return data.session.id;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, [sessionId]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      setInput("");
      setMessages((m) => [...m, { role: "user", content: message }]);
      setBusy(true);
      try {
        const sid = await ensureSession();
        if (!sid) throw new Error("session");
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id: sid, message, mode: "help", page: pathname }),
        });
        const data = await res.json();
        if (res.status === 409 && data?.error === "provider_not_ready") {
          setMessages((m) => [
            ...m,
            { role: "assistant", error: true, content: `The assistant has no ready provider. ${data.fix ?? ""}` },
          ]);
        } else if (!res.ok) {
          setMessages((m) => [
            ...m,
            { role: "assistant", error: true, content: data?.message || data?.error || "Something went wrong." },
          ]);
        } else {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: data.reply, citations: data.citations, toolResult: data.toolResult, refusal: data.refusal },
          ]);
        }
      } catch {
        setMessages((m) => [...m, { role: "assistant", error: true, content: "Network error. Try again." }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, ensureSession, pathname],
  );

  if (hidden) return null;

  const quickPrompts = QUICK_PROMPTS_BY_ROLE[role] ?? QUICK_PROMPTS_BY_ROLE.anonymous;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close help assistant" : "Open help assistant"}
        className="fixed bottom-5 right-5 z-[60] flex h-12 w-12 items-center justify-center rounded-full border border-accent/50 bg-panel text-ink shadow-card transition hover:scale-105 hover:border-accent"
      >
        <span className="text-lg" aria-hidden>
          {open ? "×" : "?"}
        </span>
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-[60] flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-panel/95 shadow-card backdrop-blur-md">
          <div className="border-b border-border px-4 py-3">
            <p className="font-display text-sm font-semibold text-ink">SkillProof Help</p>
            <p className="text-[11px] text-muted">
              Role-aware product help. No private or admin data is exposed here.
            </p>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted">Ask about how to use this page, or try:</p>
                <div className="flex flex-wrap gap-2">
                  {quickPrompts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => send(p)}
                      className="rounded-md border border-border bg-bg/60 px-2 py-1 text-[11px] text-muted transition hover:border-accent/60 hover:text-ink"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-5",
                    m.role === "user"
                      ? "bg-accent/20 text-ink"
                      : m.error
                        ? "border border-red-500/40 bg-red-500/10 text-ink"
                        : "border border-border bg-bg/60 text-ink",
                  )}
                >
                  {m.content}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.citations.map((c) => (
                        <span key={c} className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] text-muted">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted">Thinking…</p>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-border px-3 py-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about SkillProof…"
              className="flex-1 rounded-md border border-border bg-bg/60 px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent/60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-md border border-accent/50 bg-accent/15 px-3 py-1.5 text-[12px] font-medium text-ink transition hover:border-accent disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
