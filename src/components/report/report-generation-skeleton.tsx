"use client";

// Premium "AI analysis in progress" skeletons for the run report.
//
// These are presentational only. The RunCommandCenter decides when to show them
// (driven by real /api/runs/[id] event state) and passes the live counters into
// GeneratingReportPanel. The skeletons use the sp-* animation utilities defined
// in globals.css and degrade to static blocks under prefers-reduced-motion.

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

// ── primitives ───────────────────────────────────────────────────────────────

export function ShimmerBar({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("sp-skel rounded-md", className)} style={style} />;
}

export function ShimmerCard({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cn("sp-skel sp-fade-in rounded-xl p-4", className)}>{children}</div>;
}

export function PulsingDot({ tone = "warn" }: { tone?: "warn" | "good" | "accent" }) {
  const color = tone === "good" ? "bg-good" : tone === "accent" ? "bg-accent" : "bg-warn";
  return <span className={cn("sp-pulse-ring inline-block h-2 w-2 rounded-full", color)} />;
}

export function SkeletonHeader({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs text-muted">
      <PulsingDot />
      <span className="sp-fade-in">{text}</span>
    </div>
  );
}

/** Travelling staged pipeline dots — gives the panel a sense of live progress. */
export function PipelineDots({ count = 7, active = 0 }: { count?: number; active?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i <= active ? "w-5 bg-accent" : "w-2 bg-border",
            i === active + 1 && "sp-pipeline-dot bg-warn",
          )}
        />
      ))}
    </div>
  );
}

// ── section-specific skeletons ───────────────────────────────────────────────

export function ProviderMatrixSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonHeader text="Resolving provider readiness matrix…" />
      <div className="grid gap-2 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <ShimmerCard key={i} className="h-16 p-3" />
        ))}
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerBar key={i} className="h-7" />
        ))}
      </div>
    </div>
  );
}

export function ValidationContractSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonHeader text="Writing validation contract & scoring assertions…" />
      <div className="grid gap-2 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <ShimmerCard key={i} className="h-14 p-3" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <ShimmerCard key={i} className="space-y-2">
          <div className="flex gap-2">
            <ShimmerBar className="h-4 w-16" />
            <ShimmerBar className="h-4 w-20" />
            <ShimmerBar className="h-4 w-12" />
          </div>
          <ShimmerBar className="h-3 w-3/4" />
        </ShimmerCard>
      ))}
    </div>
  );
}

/** Repo file-tree shimmer + scanning line. */
export function RepoIntelligenceSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonHeader text="Scanning repository tree, routes, configs, and risk flags…" />
      <div className="grid gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerCard key={i} className="h-16 p-3" />
        ))}
      </div>
      <div className="sp-scan grid gap-1.5 rounded-xl border border-border bg-panel2/30 p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 16}px` }}>
            <span className="h-3 w-3 rounded-sm bg-border" />
            <ShimmerBar className="h-3" style={{ width: `${40 + ((i * 13) % 50)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentTimelineSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-3">
      <SkeletonHeader text="Dispatching evaluator agents…" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "sp-fade-in rounded-2xl border border-border/60 bg-panel/60 p-5",
              i === 0 && "sp-agent-glow border-warn/40",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {i === 0 ? <PulsingDot /> : <span className="h-2 w-2 rounded-full bg-border" />}
                <div className="space-y-1.5">
                  <ShimmerBar className="h-3 w-24" />
                  <ShimmerBar className="h-2 w-16" />
                </div>
              </div>
              <ShimmerBar className="h-3 w-10" />
            </div>
            <ShimmerBar className="mt-4 h-3 w-full" />
            <ShimmerBar className="mt-2 h-3 w-2/3" />
            {i === 0 && (
              <div className="mt-4 h-0.5 w-full overflow-hidden rounded-full bg-border">
                <div className="skeleton-shimmer h-full w-1/2 bg-warn" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EvidenceLockerSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonHeader text="Collecting file-backed evidence…" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <ShimmerCard key={i} className="space-y-2 p-3">
            <div className="flex gap-2">
              <ShimmerBar className="h-4 w-16" />
              <ShimmerBar className="h-4 w-12" />
              <ShimmerBar className="h-4 w-10" />
            </div>
            <ShimmerBar className="h-3 w-full" />
            <ShimmerBar className="h-2.5 w-1/3" />
          </ShimmerCard>
        ))}
      </div>
    </div>
  );
}

/** Skill-graph indeterminate bars. */
export function SkillGraphSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-3">
      <SkeletonHeader text="Aggregating measured skill dimensions…" />
      <div className="grid gap-2 md:grid-cols-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-panel2/30 p-3">
            <div className="flex items-center justify-between">
              <ShimmerBar className="h-3 w-24" />
              <ShimmerBar className="h-4 w-12" />
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-bg/70">
              <div className="sp-bar h-full rounded bg-good/70" style={{ animationDelay: `${i * 160}ms` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Terminal / log shimmer. */
export function TerminalProofSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonHeader text="Awaiting sandbox terminal proof…" />
      <div className="grid gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerCard key={i} className="h-14 p-3" />
        ))}
      </div>
      <div className="sp-scan space-y-1.5 rounded-xl border border-border bg-bg/70 p-3 font-mono">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-accent/60">$</span>
            <ShimmerBar className="h-2.5" style={{ width: `${30 + ((i * 17) % 55)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function InterviewSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonHeader text="Generating own-code interview questions…" />
      {Array.from({ length: 4 }).map((_, i) => (
        <ShimmerCard key={i} className="space-y-2 p-3">
          <ShimmerBar className="h-3 w-full" />
          <ShimmerBar className="h-3 w-4/5" />
          <ShimmerBar className="h-2.5 w-1/4" />
        </ShimmerCard>
      ))}
    </div>
  );
}

/** Validation coverage shimmer. */
export function ValidationCoverageSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonHeader text="Auditing claims against the evidence contract…" />
      <div className="grid gap-2 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ShimmerCard key={i} className="h-12 p-3" />
        ))}
      </div>
    </div>
  );
}

export function ProfileReportSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonHeader text="Preparing employer-safe report preview…" />
      <ShimmerCard className="space-y-2">
        <ShimmerBar className="h-3 w-32" />
        <ShimmerBar className="h-3 w-full" />
        <ShimmerBar className="h-3 w-11/12" />
        <ShimmerBar className="h-3 w-3/4" />
      </ShimmerCard>
      <div className="grid gap-3 md:grid-cols-2">
        <ShimmerCard className="h-28" />
        <ShimmerCard className="h-28" />
      </div>
    </div>
  );
}

// ── top-level generating panel (real event state) ────────────────────────────

export type GeneratingReportPanelProps = {
  stageLabel: string;
  completedAgents: number;
  totalAgents: number;
  progressPercent: number;
  activeAgent: string | null;
  statusMessage: string | null;
  providerMode: string;
  elapsedMs: number;
  workerLabel: string | null;
  workerTone?: "good" | "warn" | "bad";
};

function formatElapsed(ms: number): string {
  if (!ms || ms < 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function GeneratingReportPanel({
  stageLabel,
  completedAgents,
  totalAgents,
  progressPercent,
  activeAgent,
  statusMessage,
  providerMode,
  elapsedMs,
  workerLabel,
  workerTone = "good",
}: GeneratingReportPanelProps) {
  const pct = Math.max(0, Math.min(100, progressPercent));
  const activeIndex = totalAgents > 0 ? Math.min(totalAgents - 1, completedAgents) : 0;
  const workerColor = workerTone === "bad" ? "text-bad" : workerTone === "warn" ? "text-warn" : "text-good";

  return (
    <div className="sp-fade-in relative overflow-hidden rounded-2xl border border-warn/30 bg-gradient-to-br from-panel/90 to-panel2/60 p-5 shadow-card">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: "radial-gradient(circle at 12% 0%, rgba(216,154,69,0.10) 0%, transparent 55%)" }}
        aria-hidden
      />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <PulsingDot />
            <div>
              <div className="font-display text-base text-ink">Generating verified report</div>
              <div className="font-mono text-xs text-warn">{stageLabel}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-lg border border-border bg-panel2/70 px-2 py-1 font-mono text-muted">{providerMode}</span>
            <span className="rounded-lg border border-border bg-panel2/70 px-2 py-1 font-mono text-muted tabular">{formatElapsed(elapsedMs)}</span>
            {workerLabel && (
              <span className={cn("rounded-lg border border-border bg-panel2/70 px-2 py-1 font-mono", workerColor)}>{workerLabel}</span>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>
              {completedAgents}/{totalAgents} agents complete
            </span>
            <span className="tabular">{pct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-warn to-accent transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <PipelineDots count={Math.max(7, Math.min(totalAgents || 7, 14))} active={activeIndex} />
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted">Active agent</div>
            <div className="font-mono text-xs text-ink">{activeAgent ?? "—"}</div>
          </div>
        </div>

        {statusMessage && (
          <p className="mt-3 rounded-lg border border-border bg-bg/40 px-3 py-2 font-mono text-[11px] text-muted">{statusMessage}</p>
        )}
      </div>
    </div>
  );
}
