import { runAgentJson } from "@/lib/providers/run-agent";
import { hydrateEvidenceFromContext } from "@/lib/evidence";
import { buildContextBlock } from "./_analysis";
import { assertionResultsForDimension } from "./assertions";
import type {
  ArchitectureOutput,
  Handoff,
  MissionState,
  ValidationAssertionResult,
} from "./types";

const SYSTEM = `You are the Architecture Analyst agent of SkillProof AI.
Judge architectural quality from the provided context pack only.
Return STRICT JSON, no commentary:
{
  "architecture_score": number (0-100),
  "strengths": string[],
  "weaknesses": string[],
  "evidence": [{"file": string, "line": number?, "reason": string}]
}
Every claim must cite a file from the snippets. If snippets are insufficient, lower confidence and say so.`;

const SCHEMA_HINT = '{"architecture_score":number,"strengths":string[],"weaknesses":string[],"evidence":[{"file":string,"line":number?,"reason":string}]}';

function fallback(state?: MissionState): ArchitectureOutput {
  const file = state?.context_pack?.filesIndex.important[0] ?? state?.context_pack?.filesIndex.readme ?? undefined;
  return {
    architecture_score: 60,
    strengths: ["Heuristic: folder layout present"],
    weaknesses: ["Provider unavailable — architecture not verified."],
    evidence: [{ file, reason: "Deterministic architecture signal from repo layout and intelligence index.", source: "deterministic" }],
    score_source: "deterministic",
  };
}

function deriveAssertionResults(
  state: MissionState,
  out: ArchitectureOutput
): ValidationAssertionResult[] {
  const hasArchitectureSignals =
    (state.context_pack?.intelligence?.routes.length ?? 0) > 0 ||
    (state.context_pack?.intelligence?.components.length ?? 0) > 0 ||
    (state.context_pack?.filesIndex.important.length ?? 0) >= 2;
  return assertionResultsForDimension({
    state,
    dimension: "architecture",
    agent: "architecture",
    evidence: out.evidence,
    passed: () => hasArchitectureSignals,
    partial: () => out.architecture_score >= 45,
    baseNote: hasArchitectureSignals
      ? "Deterministic repo index plus cited files support architecture assertion."
      : "Architecture evidence is limited to broad file layout signals.",
  });
}

export async function runArchitecture(state: MissionState): Promise<Handoff<ArchitectureOutput>> {
  if (!state.context_pack) throw new Error("architecture: context_pack missing — run repo-scanner first");

  const user = `Validation contract dimensions: ${state.contract?.evaluation_dimensions.join(", ") ?? "n/a"}
Target role: ${state.target_role}

${buildContextBlock(state.context_pack)}

Return the JSON now.`;

  const res = await runAgentJson<ArchitectureOutput>({
    state,
    agentName: "architecture",
    role: "worker",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 1800,
  });

  const out: ArchitectureOutput = {
    ...res.output,
    score_source: res.source,
  };
  out.evidence = hydrateEvidenceFromContext(out.evidence ?? [], state.context_pack, res.source === "llm" ? "llm" : "deterministic");
  out.assertion_results = deriveAssertionResults(state, out);

  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;
  state.scores.push({
    skill: "Architecture",
    score: out.architecture_score,
    evidence: out.evidence,
    confidence: res.source === "llm" ? 0.85 : 0.55,
    source: res.source,
    strengths: out.strengths,
    weaknesses: out.weaknesses,
    assertion_ids: out.assertion_results.map((a) => a.assertion_id),
  });
  state.assertion_results.push(...(out.assertion_results ?? []));

  return {
    agent: "architecture",
    completed: ["architecture_analyzed"],
    unresolved: [],
    evidence: [
      ...out.evidence,
      { reason: `provider=${res.provider} model=${res.model}` },
    ],
    issues_found: out.weaknesses,
    next_recommended: "code-quality",
    assertion_results: out.assertion_results,
    output: out,
  };
}
