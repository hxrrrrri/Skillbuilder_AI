import { runAgentJson } from "@/lib/providers/run-agent";
import { buildContextBlock } from "./_analysis";
import { hydrateEvidenceFromContext } from "@/lib/evidence";
import { assertionResultsForDimension } from "./assertions";
import {
  getTerminalEvidence,
  hasFailingCommand,
  hasPassingCommand,
} from "@/lib/local-runner/evidence-analysis";
import type {
  CodeQualityOutput,
  Evidence,
  Handoff,
  MissionState,
  ValidationAssertionResult,
} from "./types";

const SYSTEM = `You are the Code Quality agent of SkillProof AI.
Evaluate maintainability of the provided source snippets only. Do NOT invent files.
Return STRICT JSON:
{
  "code_quality_score": number (0-100),
  "observations": string[],
  "evidence": [{"file": string, "line": number?, "reason": string}]
}`;

const SCHEMA_HINT = '{"code_quality_score":number,"observations":string[],"evidence":[{"file":string,"line":number?,"reason":string}]}';

function fallback(state?: MissionState): CodeQualityOutput {
  const file = state?.context_pack?.filesIndex.important[0] ?? undefined;
  return {
    code_quality_score: 55,
    observations: ["LLM unavailable — heuristic score only"],
    evidence: [{ file, reason: "Heuristic mode: deterministic score returned from repo intelligence and file layout." }],
    score_source: "heuristic",
  };
}

function deriveAssertionResults(state: MissionState, out: CodeQualityOutput): ValidationAssertionResult[] {
  const typed = !!state.context_pack?.detected.hasTypeScript || (state.context_pack?.intelligence?.languages.TypeScript ?? 0) > 0;
  return assertionResultsForDimension({
    state,
    dimension: "code_quality",
    agent: "code-quality",
    evidence: out.evidence,
    passed: (a) => /typing|typed|strict/i.test(a.statement) ? typed : out.code_quality_score >= 55,
    partial: () => out.code_quality_score >= 45,
    baseNote: "Code-quality assertions require direct file or terminal evidence, not only the aggregate score.",
  });
}

// Apply build + typecheck terminal evidence to nudge code quality score.
function applyTerminalEvidence(state: MissionState, out: CodeQualityOutput) {
  const evidence = getTerminalEvidence(state);
  const extra: Evidence[] = [];
  const buildPass = hasPassingCommand(evidence, "build");
  const buildFail = hasFailingCommand(evidence, "build");
  const tcPass = hasPassingCommand(evidence, "typecheck");
  const tcFail = hasFailingCommand(evidence, "typecheck");

  if (buildPass) {
    out.code_quality_score = Math.min(100, out.code_quality_score + 5);
    extra.push({ reason: `terminal · build OK · \`${buildPass.command}\` exit=0`, source: "terminal" });
    out.observations.unshift("Local build succeeded.");
  } else if (buildFail) {
    out.code_quality_score = Math.max(0, out.code_quality_score - 12);
    extra.push({ reason: `terminal · build FAILED · \`${buildFail.command}\` exit=${buildFail.exitCode}`, source: "terminal" });
    out.observations.unshift("Local build failed — reliability risk.");
  }

  if (tcPass) {
    out.code_quality_score = Math.min(100, out.code_quality_score + 4);
    extra.push({ reason: `terminal · typecheck OK · \`${tcPass.command}\` exit=0`, source: "terminal" });
  } else if (tcFail) {
    out.code_quality_score = Math.max(0, out.code_quality_score - 10);
    extra.push({ reason: `terminal · typecheck FAILED · \`${tcFail.command}\` exit=${tcFail.exitCode}`, source: "terminal" });
    out.observations.unshift("Local typecheck failed — likely typing issues.");
  }

  out.evidence = [...out.evidence, ...extra];
}

export async function runCodeQuality(state: MissionState): Promise<Handoff<CodeQualityOutput>> {
  if (!state.context_pack) throw new Error("code-quality: context_pack missing");

  const user = `Target role: ${state.target_role}

${buildContextBlock(state.context_pack)}

Return the JSON now.`;

  const res = await runAgentJson<CodeQualityOutput>({
    state,
    agentName: "code-quality",
    role: "worker",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 1800,
    fallback: () => fallback(state),
  });

  const out: CodeQualityOutput = { ...res.output, score_source: res.source };
  out.evidence = hydrateEvidenceFromContext(out.evidence ?? [], state.context_pack, res.source === "llm" ? "llm" : "heuristic");
  applyTerminalEvidence(state, out);
  out.assertion_results = deriveAssertionResults(state, out);

  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;
  state.scores.push({
    skill: "Code Quality",
    score: out.code_quality_score,
    evidence: out.evidence,
    confidence: res.source === "llm" ? 0.85 : res.source === "mock" ? 0.3 : 0.6,
    source: res.source,
    weaknesses: out.observations,
    assertion_ids: out.assertion_results.map((a) => a.assertion_id),
  });
  state.assertion_results.push(...(out.assertion_results ?? []));

  return {
    agent: "code-quality",
    completed: ["code_quality_analyzed"],
    unresolved: [],
    evidence: [
      ...out.evidence,
      { reason: `provider=${res.provider} model=${res.model}` },
    ],
    issues_found: out.observations,
    next_recommended: "testing",
    assertion_results: out.assertion_results,
    output: out,
  };
}
