"use client";
import { cn } from "@/lib/utils";

const LABELS: Record<string, { title: string; subtitle: string }> = {
  orchestrator: { title: "Orchestrator", subtitle: "Writes validation contract" },
  "repo-scanner": { title: "Repo Scanner", subtitle: "Deterministic — no LLM" },
  architecture: { title: "Architecture Analyst", subtitle: "Module boundaries, separation" },
  "code-quality": { title: "Code Quality", subtitle: "Naming, typing, complexity" },
  testing: { title: "Testing & Reliability", subtitle: "Tests, CI, coverage signals" },
  security: { title: "Security Awareness", subtitle: "Secrets, validation, eval" },
  "git-evidence": { title: "Git Evidence", subtitle: "Commit cadence + quality" },
  "interview-gen": { title: "Interview Generator", subtitle: "Questions from real code" },
  validator: { title: "Validator", subtitle: "Fresh context — audits claims" },
  "skill-graph": { title: "Skill Graph Builder", subtitle: "Weighted aggregation" },
  "profile-gen": { title: "Profile Generator", subtitle: "Public credibility profile" },
};

export function AgentCard({
  agent,
  status,
  notes,
}: {
  agent: string;
  status: "pending" | "running" | "completed" | "failed";
  notes?: string | null;
}) {
  const meta = LABELS[agent] ?? { title: agent, subtitle: "" };
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-panel/70 p-4 transition",
        status === "running" && "ring-1 ring-warn/40",
        status === "completed" && "border-accent/30",
        status === "failed" && "border-bad/40"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`dot dot-${status}`} />
            <div className="font-medium text-ink truncate">{meta.title}</div>
          </div>
          <div className="text-xs text-muted truncate">{meta.subtitle}</div>
        </div>
        <span className="text-xs uppercase tracking-wide text-muted">{status}</span>
      </div>
      {notes && <div className="mt-2 text-xs text-muted line-clamp-2">{notes}</div>}
    </div>
  );
}
