"use client";
import { cn } from "@/lib/utils";

const LABELS: Record<string, { title: string; subtitle: string }> = {
  orchestrator: { title: "Orchestrator", subtitle: "Writes validation contract" },
  "repo-scanner": { title: "Repo Scanner", subtitle: "Deterministic — no LLM" },
  architecture: { title: "Architecture Analyst", subtitle: "Module boundaries" },
  "code-quality": { title: "Code Quality", subtitle: "Naming, typing, complexity" },
  testing: { title: "Testing & Reliability", subtitle: "Tests, CI, coverage" },
  security: { title: "Security Awareness", subtitle: "Secrets, validation" },
  "git-evidence": { title: "Git Evidence", subtitle: "Commit cadence + quality" },
  documentation: { title: "Documentation", subtitle: "README specificity" },
  authenticity: { title: "Authenticity Signals", subtitle: "Ownership and provenance signals" },
  "interview-gen": { title: "Interview Generator", subtitle: "Questions from real code" },
  validator: { title: "Validator", subtitle: "Fresh context audit" },
  "skill-graph": { title: "Skill Graph", subtitle: "Weighted aggregation" },
  "profile-gen": { title: "Profile Generator", subtitle: "Verified credibility" },
};

export function AgentCard({
  agent,
  status,
  notes,
}: {
  agent: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  notes?: string | null;
}) {
  const meta = LABELS[agent] ?? { title: agent, subtitle: "" };
  const isRunning = status === "running";
  const isDone = status === "completed";
  const isFailed = status === "failed";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-panel/70 p-5 transition-all duration-300",
        isDone && "border-accent/30 bg-panel/80",
        isRunning && "border-warn/40 bg-warn/5 ring-1 ring-warn/20",
        isFailed && "border-bad/35 bg-bad/5",
        status === "skipped" && "border-warn/20 opacity-60",
        !isDone && !isRunning && !isFailed && status !== "skipped" && "border-border/60"
      )}
    >
      {isDone && (
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: "radial-gradient(circle at 20% 50%, rgba(217,119,87,0.06) 0%, transparent 70%)" }}
        />
      )}
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("dot flex-shrink-0",
          status === "completed" ? "dot-completed" :
          status === "running" ? "dot-running" :
          status === "failed" ? "dot-failed" :
          status === "skipped" ? "dot-skipped" :
          "dot-pending"
        )} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{meta.title}</div>
            <div className="truncate text-xs text-muted">{meta.subtitle}</div>
          </div>
        </div>
        <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted">{status}</span>
      </div>
      {notes && (
        <p className="relative mt-3 line-clamp-2 text-xs leading-5 text-muted">{notes}</p>
      )}
      {isRunning && (
        <div className="relative mt-4 h-0.5 w-full overflow-hidden rounded-full bg-border">
          <div className="absolute inset-y-0 left-0 w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] bg-warn" />
        </div>
      )}
    </div>
  );
}
