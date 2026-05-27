// Terminal evidence analysis — helpers agents use to ground scores in real
// command output (not just static snippets).

import type { MissionState, Evidence } from "@/agents/types";
import type { TerminalEvidence } from "./types";

export function getTerminalEvidence(
  state: MissionState,
  usedFor?: TerminalEvidence["usedFor"],
): TerminalEvidence[] {
  const list = state.terminal_evidence ?? [];
  if (!usedFor) return list;
  return list.filter((e) => e.usedFor === usedFor);
}

export function hasPassingCommand(
  evidence: TerminalEvidence[],
  usedFor: TerminalEvidence["usedFor"],
): TerminalEvidence | null {
  const hit = evidence.find((e) => e.usedFor === usedFor && e.exitCode === 0);
  return hit ?? null;
}

export function hasFailingCommand(
  evidence: TerminalEvidence[],
  usedFor: TerminalEvidence["usedFor"],
): TerminalEvidence | null {
  const hit = evidence.find(
    (e) => e.usedFor === usedFor && e.exitCode !== null && e.exitCode !== 0,
  );
  return hit ?? null;
}

export function summarizeTerminalEvidence(evidence: TerminalEvidence[]): {
  total: number;
  passed: number;
  failed: number;
  byUsedFor: Record<string, { passed: number; failed: number }>;
  text: string;
} {
  let passed = 0;
  let failed = 0;
  const byUsedFor: Record<string, { passed: number; failed: number }> = {};
  for (const e of evidence) {
    const ok = e.exitCode === 0;
    if (ok) passed += 1;
    else if (e.exitCode !== null) failed += 1;
    if (!byUsedFor[e.usedFor]) byUsedFor[e.usedFor] = { passed: 0, failed: 0 };
    if (ok) byUsedFor[e.usedFor].passed += 1;
    else if (e.exitCode !== null) byUsedFor[e.usedFor].failed += 1;
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(byUsedFor)) {
    parts.push(`${k}: ${v.passed}P/${v.failed}F`);
  }
  return {
    total: evidence.length,
    passed,
    failed,
    byUsedFor,
    text: parts.length ? parts.join(" · ") : "no terminal evidence",
  };
}

// Build Evidence rows for the locker from a TerminalEvidence list.
export function evidenceRowsFromTerminal(
  evidence: TerminalEvidence[],
  filter?: TerminalEvidence["usedFor"],
): Evidence[] {
  const list = filter ? evidence.filter((e) => e.usedFor === filter) : evidence;
  return list.map((e) => ({
    file: undefined,
    reason: `terminal · ${e.usedFor} · \`${e.command}\` exit=${e.exitCode ?? "?"} (${e.durationMs}ms)`,
    snippet: (e.stdoutSummary || "").slice(0, 300),
  }));
}
