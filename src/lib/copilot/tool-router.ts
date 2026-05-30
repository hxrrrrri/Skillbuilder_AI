// Two-stage copilot tool routing.
//
// Stage A (this file) runs BEFORE any model call. It classifies the user's
// message deterministically and decides one of four things:
//   - direct_execute: an obvious read-only intent → run exactly one read tool,
//     skip the LLM entirely (zero model tokens).
//   - llm_with_tools: ambiguous or write intent → call the model, but advertise
//     only a SMALL focused manifest (≤5 tools), never the full admin registry.
//   - clarify: the intent is too vague to act on → ask one focused question.
//   - refuse: a forbidden request (secrets / arbitrary SQL / shell / bypass /
//     fabrication) → refuse and let the engine record the attempt.
//
// This keeps the prompt small and makes tool choice reliable: the model only
// ever sees the few tools that the deterministic router already judged relevant.

import { listTools } from "./tools";
import { needsLlmSynthesis } from "./answer-planner";
import type { CopilotMode } from "./context";

export type ToolRouteMode = "direct_execute" | "llm_with_tools" | "clarify" | "refuse";

export type ToolRouteDecision = {
  mode: ToolRouteMode;
  reason: string;
  selectedTools: string[];
  directTool?: { name: string; input: Record<string, unknown> };
  clarifyQuestion?: string;
  confidence: number;
};

/** Hard budget caps for a copilot turn. Enforced by the router + engine. */
export const COPILOT_BUDGET = {
  maxSelectedTools: 5,
  maxContextDocs: 3,
  maxDocChunkChars: 500,
  maxChatResponseTokens: 900,
  maxToolOutputChars: 3000,
} as const;

export type ManifestEntry = { name: string; risk: string; title: string; description: string };

/** name + short title only — cheapest manifest, for a router/disambiguation prompt. */
export function toolNameOnlyManifest(entries: ManifestEntry[]): Array<{ name: string; title: string }> {
  return entries.slice(0, COPILOT_BUDGET.maxSelectedTools).map((t) => ({ name: t.name, title: t.title }));
}

/** name + risk + short description. */
export function compactToolManifest(entries: ManifestEntry[]): Array<{ name: string; risk: string; description: string }> {
  return entries.slice(0, COPILOT_BUDGET.maxSelectedTools).map((t) => ({
    name: t.name,
    risk: t.risk,
    description: t.description.slice(0, 160),
  }));
}

/** full entry, but only ever for the ≤5 selected tools. */
export function fullToolManifest(entries: ManifestEntry[]): ManifestEntry[] {
  return entries.slice(0, COPILOT_BUDGET.maxSelectedTools);
}

// ── Forbidden intent detection (mirrors the forbidden tool registry) ──────────

const FORBIDDEN_PATTERNS: Array<{ re: RegExp; tool: string }> = [
  { re: /\b(\.env|env file|api key|secret key|private key|session token|access token|reveal secret)\b/i, tool: "reveal_secrets" },
  { re: /\b(arbitrary sql|raw sql|run sql|dump users|select \* from|drop table|delete from)\b/i, tool: "run_arbitrary_sql" },
  { re: /\b(arbitrary shell|run shell|shell command|terminal command|powershell|bash command|exec )\b/i, tool: "run_arbitrary_shell" },
  { re: /\b(bypass|skip|override).{0,20}(publish|trust|gate)\b/i, tool: "bypass_publish_gate" },
  { re: /\b(fabricate|fake|invent|forge).{0,20}(evidence|proof)\b/i, tool: "fabricate_evidence" },
  { re: /\b(fabricate|fake|invent|forge).{0,20}(score|result)\b/i, tool: "fabricate_score" },
];

function detectForbidden(text: string): string | null {
  for (const { re, tool } of FORBIDDEN_PATTERNS) if (re.test(text)) return tool;
  return null;
}

// ── Deterministic admin read-intent detection ────────────────────────────────
// Each rule maps a message to a single read tool + its input. Returns the first
// match. Ported and extended from the engine's prior inline inference so the
// router is the one source of truth for routing.

function emailIn(message: string): string | undefined {
  return message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function runIdIn(message: string): string | undefined {
  return message.match(/\b(?:run[_\s-]?id|run)\s*[:#]?\s*([a-z0-9_-]{6,})\b/i)?.[1];
}

function detectAdminRead(message: string): { name: string; input: Record<string, unknown> } | null {
  const text = message.toLowerCase();

  // provider / agent / prompt operations
  if (/\bprovider\b/.test(text) && /\b(health|ready|readiness|status|installed|authenticated)\b/.test(text)) {
    return { name: "read_provider_health", input: {} };
  }
  if (/\bagents?\b/.test(text) && /\b(config|configs|provider|model|reasoning|settings|setup)\b/.test(text)) {
    return { name: "read_agent_configs", input: {} };
  }
  if (/\b(prompt|prompts)\b/.test(text) && /\b(version|versions|active|history)\b/.test(text)) {
    return { name: "read_prompt_versions", input: {} };
  }
  if (/\b(rubric|scoring prompt)\b/.test(text)) {
    return { name: "read_rubric_config", input: {} };
  }

  // runs
  const runId = runIdIn(message);
  if (/\b(publish|publishing).{0,30}(block|blocker|gate|fail)|why.{0,20}(can'?t|cannot).{0,20}publish\b/.test(text) && runId) {
    return { name: "explain_publish_gate_failure", input: { runId } };
  }
  if (/\b(evidence)\b/.test(text) && /\b(summary|finding|findings|run)\b/.test(text) && runId) {
    return { name: "read_run_evidence_summary", input: { runId } };
  }
  if (/\b(run)\b/.test(text) && /\b(status|state|score|verification)\b/.test(text) && runId) {
    return { name: "read_run_status", input: { runId } };
  }
  if (/\b(failed|failing|errored|broken)\b/.test(text) && /\bruns?\b/.test(text)) {
    return { name: "read_failed_runs", input: {} };
  }

  // platform / data model / architecture
  if (/\b(platform overview|overview|health summary|counts|how many)\b/.test(text)) {
    return { name: "read_platform_overview", input: {} };
  }
  if (/\b(where|stored|schema|data model|database model|prisma)\b/.test(text) && /\b(student|candidate|profile|run|score|cohort|tenant|user)\b/.test(text)) {
    return { name: "explain_data_model", input: { topic: message.slice(0, 200) } };
  }
  if (/\b(dataflow|workflow|architecture|verification workflow)\b/.test(text)) {
    return { name: "explain_project_architecture", input: { topic: message.slice(0, 200) } };
  }

  // students / candidates / profiles
  if (/\bstudents?\b/.test(text) && /\bprofiles?\b/.test(text) && /\b(created|have|with|published|been)\b/.test(text)) {
    const visibility = text.includes("public") ? "public" : text.includes("private") ? "private" : text.includes("unlisted") ? "unlisted" : "any";
    return { name: "list_students_with_profiles", input: { visibility } };
  }
  const email = emailIn(message);
  if (/\b(full details|student details|get student|candidate details|tell me about|profile of)\b/.test(text) && email) {
    return { name: "get_student_profile_admin", input: { email } };
  }
  const minScore = message.match(/\b(?:score|scores?)\s*(?:above|over|>=|greater than|at least)\s*(\d{1,3})\b/i)?.[1];
  if (/\b(candidates?|students?)\b/.test(text) && minScore) {
    return { name: "search_candidates_admin", input: { minScore: Math.min(100, Number(minScore)) } };
  }
  if (/\b(public|private|unlisted)\s+profiles?\b/.test(text) || (/\bprofiles?\b/.test(text) && /\b(list|show|all)\b/.test(text))) {
    const visibility = text.includes("public") ? "public" : text.includes("private") ? "private" : text.includes("unlisted") ? "unlisted" : "any";
    return { name: "list_profiles_admin", input: { visibility } };
  }
  if (/\b(route|feature|source file|which file|implements?)\b/.test(text)) {
    return { name: "explain_route_or_feature", input: { query: message.slice(0, 300) } };
  }

  return null;
}

// A vague "show me the details" with no concrete target → ask for clarification.
function isVagueDetailRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  const vague = /^(show|give|get|list|tell)\s+(me\s+)?(the\s+)?(details|more|everything|it|this|that|info|information)\b/.test(t);
  const hasTarget = /\b(student|candidate|profile|run|provider|agent|cohort|tenant|user|prompt|rubric|evidence|platform|architecture|data model|score)\b/.test(t);
  return vague && !hasTarget;
}

// ── Candidate selection for the llm_with_tools path (keyword scoring) ─────────

function scoreToolForMessage(tool: ManifestEntry, words: string[]): number {
  const hay = `${tool.name} ${tool.title} ${tool.description}`.toLowerCase().replace(/_/g, " ");
  let score = 0;
  for (const w of words) {
    if (w.length < 3) continue;
    if (hay.includes(w)) score += 1;
  }
  return score;
}

function selectCandidateTools(message: string, available: ManifestEntry[]): string[] {
  const words = Array.from(new Set(message.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)));
  const ranked = available
    .map((t) => ({ name: t.name, score: scoreToolForMessage(t, words) }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, COPILOT_BUDGET.maxSelectedTools).map((t) => t.name);
}

// ── Public API ───────────────────────────────────────────────────────────────

export type RouteParams = {
  message: string;
  mode: CopilotMode;
  role: string;
};

/**
 * Classify a copilot message and decide how to handle it, selecting at most
 * COPILOT_BUDGET.maxSelectedTools tools. The full admin tool registry is never
 * returned here.
 */
export function routeCopilotToolIntent(params: RouteParams): ToolRouteDecision {
  const { message, mode, role } = params;
  const available = listTools(mode, role as any).map((t) => ({
    name: t.name,
    risk: t.risk,
    title: t.title,
    description: t.description,
  }));
  const availableNames = new Set(available.map((t) => t.name));

  // 1) Forbidden requests refuse outright (admin mode is where these tools live).
  const forbidden = detectForbidden(message);
  if (forbidden && mode === "admin") {
    return {
      mode: "refuse",
      reason: `forbidden_intent:${forbidden}`,
      selectedTools: [],
      directTool: { name: forbidden, input: {} },
      confidence: 0.95,
    };
  }

  // 2) Admin deterministic read intents execute directly with no model call —
  //    UNLESS the admin also asked the model to explain/compare/recommend, in
  //    which case we still run that tool but route through the LLM to synthesize.
  if (mode === "admin") {
    const direct = detectAdminRead(message);
    if (direct && availableNames.has(direct.name)) {
      if (needsLlmSynthesis(message)) {
        return {
          mode: "llm_with_tools",
          reason: `synthesis_over_read:${direct.name}`,
          selectedTools: Array.from(new Set([direct.name, ...selectCandidateTools(message, available)])).slice(0, COPILOT_BUDGET.maxSelectedTools),
          confidence: 0.6,
        };
      }
      return {
        mode: "direct_execute",
        reason: `deterministic_read:${direct.name}`,
        selectedTools: [direct.name],
        directTool: direct,
        confidence: 0.9,
      };
    }
    if (isVagueDetailRequest(message)) {
      return {
        mode: "clarify",
        reason: "vague_detail_request",
        selectedTools: selectCandidateTools(message, available),
        clarifyQuestion:
          "Which records do you want details on — a specific student, profile, run, provider, or agent? Name one and I'll pull it.",
        confidence: 0.6,
      };
    }
  }

  // 3) Everything else: let the model decide, but advertise only a focused set.
  const selected = selectCandidateTools(message, available).filter((n) => availableNames.has(n));
  return {
    mode: "llm_with_tools",
    reason: selected.length ? "focused_tool_set" : "no_obvious_tool",
    selectedTools: selected,
    confidence: selected.length ? 0.5 : 0.3,
  };
}

/** Map selected tool names back to compact manifest entries for the prompt. */
export function manifestForSelection(
  selected: string[],
  mode: CopilotMode,
  role: string,
): ManifestEntry[] {
  const byName = new Map(
    listTools(mode, role as any).map((t) => [t.name, { name: t.name, risk: t.risk, title: t.title, description: t.description }]),
  );
  const out: ManifestEntry[] = [];
  for (const name of selected.slice(0, COPILOT_BUDGET.maxSelectedTools)) {
    const e = byName.get(name);
    if (e) out.push(e);
  }
  return out;
}
