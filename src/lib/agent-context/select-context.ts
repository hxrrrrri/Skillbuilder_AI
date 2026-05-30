// Per-agent context selection.
//
// Instead of handing every agent the full repo dump, each LLM agent gets only:
//   - the validation contract summary (dimensions + role)
//   - a compact deterministic repo-intelligence summary
//   - the snippets relevant to ITS dimension
//   - prior evidence so far, passed as compact evidence IDs (not full text)
//   - a terminal-proof summary when relevant to the agent
// The whole thing is truncated to the agent's input-token budget. Deterministic
// stages receive nothing (they run zero-token code paths).
//
// The validator gets a different shape: a compact claim/evidence table plus only
// the snippets tied to disputed/important claims — never the full raw outputs.

import {
  budgetForAgent,
  truncateToBudget,
  estimateTokensFromText,
  type AgentTokenBudget,
  type ContextStrategy,
} from "@/lib/token-budget";
import type { MissionState, RepoContextPack, ScoreClaim } from "@/agents/types";

export type SelectedContext = {
  agentName: string;
  text: string;
  estimatedInputTokens: number;
  truncated: boolean;
  strategy: ContextStrategy;
  budget: AgentTokenBudget;
};

const DIMENSION_SNIPPET_HINTS: Record<string, RegExp> = {
  architecture: /(^|\/)(app|src|server|pages|routes?)\/|index|layout|config|module/i,
  "code-quality": /\.(ts|tsx|js|jsx|py|go|rs|java)$/i,
  testing: /(test|spec|__tests__|e2e|\.test\.|\.spec\.|playwright|vitest|jest|pytest)/i,
  security: /(auth|secret|env|token|crypto|password|security|middleware|cors)/i,
  documentation: /(readme|(^|\/)docs?\/|\.md$|contributing|license)/i,
  authenticity: /(readme|package\.json|(^|\/)src\/)/i,
  "ai-collaboration": /(readme|\.md$|prompt|agent|copilot)/i,
};

function hasRiskFlags(pack: RepoContextPack | null): boolean {
  return !!pack?.intelligence?.riskFlags?.length;
}

function contractSummary(state: MissionState): string {
  const dims = state.contract?.evaluation_dimensions ?? [];
  return [
    "## Contract",
    `Target role: ${state.target_role} (${state.candidate_level ?? "n/a"})`,
    `Evaluation dimensions: ${dims.join(", ") || "n/a"}`,
  ].join("\n");
}

function repoIntelSummary(pack: RepoContextPack): string {
  const i = pack.intelligence;
  const lines = [
    "## Repo intelligence (deterministic)",
    `${pack.meta.owner}/${pack.meta.repo} · ${pack.detected.framework ?? "unknown"} · ${pack.detected.testFramework ?? "no tests detected"}`,
    `Files: ${pack.filesIndex.total} · Tests: ${pack.filesIndex.tests.length} · CI: ${pack.detected.hasCI} · TS: ${pack.detected.hasTypeScript}`,
  ];
  if (i) {
    if (i.routes?.length) lines.push(`Routes: ${i.routes.slice(0, 8).map((r) => r.route).join(", ")}`);
    if (i.components?.length) lines.push(`Components: ${i.components.slice(0, 8).map((c) => c.name).join(", ")}`);
    if (i.riskFlags?.length) lines.push(`Risk flags: ${i.riskFlags.slice(0, 6).map((r) => `${r.severity}:${r.reason}`).join("; ")}`);
  }
  // Only the RANKED important files — never the full file list.
  lines.push(`Important files: ${pack.filesIndex.important.slice(0, 6).join(", ") || "(none)"}`);
  return lines.join("\n");
}

function dimensionSnippets(pack: RepoContextPack, agentName: string, maxChars: number): { text: string; truncated: boolean } {
  const hint = DIMENSION_SNIPPET_HINTS[agentName];
  const ranked = hint ? pack.snippets.filter((s) => hint.test(s.path)) : [];
  const chosen = (ranked.length ? ranked : pack.snippets).slice(0, 4);
  if (!chosen.length) return { text: "", truncated: false };
  const per = Math.max(200, Math.floor(maxChars / chosen.length));
  return {
    text: [
      "## Relevant snippets",
      ...chosen.map((s) => `--- ${s.path}${s.truncated || s.content.length > per ? " (truncated)" : ""}\n${s.content.slice(0, per)}`),
    ].join("\n"),
    truncated: chosen.some((s) => s.truncated || s.content.length > per),
  };
}

export function evidenceId(file: string | undefined, index: number): string {
  const base = (file ?? "ctx").replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase() || "ctx";
  return `ev_${base}_${index}`;
}

/** Compact prior evidence: ID + file + claim + confidence + source — not full text. */
function evidenceSoFar(state: MissionState, max: number): string {
  const rows: string[] = [];
  let idx = 0;
  for (const claim of state.scores ?? []) {
    for (const ev of claim.evidence ?? []) {
      if (rows.length >= max) break;
      idx += 1;
      const file = (ev as any).file as string | undefined;
      const line = (ev as any).line as number | undefined;
      const reason = String((ev as any).reason ?? "").slice(0, 100);
      rows.push(
        `| ${evidenceId(file, idx)} | ${file ?? "—"}${line ? `:${line}` : ""} | ${claim.skill} | ${(claim.confidence ?? 0).toFixed(2)} | ${(ev as any).source ?? claim.source ?? "—"} | ${reason} |`,
      );
    }
  }
  if (!rows.length) return "";
  return ["## Evidence so far", "| id | location | skill | conf | source | claim |", "|---|---|---|---|---|---|", ...rows].join("\n");
}

/** Validator-only: a compact table of every claim it must audit. */
function validatorClaimsTable(state: MissionState): string {
  const rows = (state.scores ?? []).map(
    (c: ScoreClaim) =>
      `| ${c.skill} | ${c.score} | ${(c.confidence ?? 0).toFixed(2)} | ${c.source ?? "—"} | ${(c.evidence?.length ?? 0)} | ${(c.assertion_ids ?? []).join(",") || "—"} |`,
  );
  if (!rows.length) return "## Claims to audit\n(none)";
  return ["## Claims to audit", "| skill | score | conf | source | #evidence | assertions |", "|---|---|---|---|---|---|", ...rows].join("\n");
}

function terminalProofSummary(state: MissionState): string {
  const ev = state.terminal_evidence ?? [];
  if (!ev.length) return "";
  const ok = ev.filter((e: any) => e.exitCode === 0).length;
  const lines = ev.slice(0, 6).map((e: any) => `- \`${e.command}\` exit=${e.exitCode}`);
  return [`## Terminal proof (${ok}/${ev.length} passed)`, ...lines].join("\n");
}

const TERMINAL_RELEVANT = new Set(["git-evidence", "testing", "security", "code-quality", "validator"]);

/**
 * Build the focused context for an agent, capped to its input-token budget.
 * Deterministic stages get an empty context (they don't call an LLM).
 */
export function selectContextForAgent(state: MissionState, agentName: string): SelectedContext {
  const budget = budgetForAgent(agentName, { securityRiskFlagged: hasRiskFlags(state.context_pack) });
  if (budget.modelTier === "deterministic") {
    return { agentName, text: "", estimatedInputTokens: 0, truncated: false, strategy: budget.contextStrategy, budget };
  }

  const pack = state.context_pack;
  const parts: string[] = [contractSummary(state)];
  let snippetsTruncated = false;
  if (pack) parts.push(repoIntelSummary(pack));

  if (budget.contextStrategy === "validator") {
    parts.push(validatorClaimsTable(state));
    parts.push(evidenceSoFar(state, 40));
    // Validator gets only a couple of snippets for the highest-stakes claims.
    if (pack) {
      const snippets = dimensionSnippets(pack, "code-quality", Math.floor(budget.maxInputTokens * 1.5));
      parts.push(snippets.text);
      snippetsTruncated = snippets.truncated;
    }
  } else {
    if (pack) {
      const snippets = dimensionSnippets(pack, agentName, Math.floor(budget.maxInputTokens * 2));
      parts.push(snippets.text);
      snippetsTruncated = snippets.truncated;
    }
    parts.push(evidenceSoFar(state, 8));
  }

  if (TERMINAL_RELEVANT.has(agentName)) {
    const t = terminalProofSummary(state);
    if (t) parts.push(t);
  }

  const raw = parts.filter(Boolean).join("\n\n");
  const { text, truncated } = truncateToBudget(raw, budget.maxInputTokens);
  return {
    agentName,
    text,
    estimatedInputTokens: estimateTokensFromText(text),
    truncated: snippetsTruncated || truncated,
    strategy: budget.contextStrategy,
    budget,
  };
}
