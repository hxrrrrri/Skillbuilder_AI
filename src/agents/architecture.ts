import { runAgentJson } from "@/lib/providers/run-agent";
import { buildContextBlock } from "./_analysis";
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

function fallback(): ArchitectureOutput {
  return {
    architecture_score: 60,
    strengths: ["Heuristic: folder layout present"],
    weaknesses: ["LLM unavailable — heuristic score only"],
    evidence: [{ reason: "Heuristic mode: deterministic score returned." }],
    score_source: "heuristic",
  };
}

function deriveAssertionResults(
  state: MissionState,
  out: ArchitectureOutput
): ValidationAssertionResult[] {
  const contract = state.contract;
  if (!contract) return [];
  return contract.assertions
    .filter((a) => a.dimension === "architecture")
    .map((a) => ({
      assertion_id: a.id,
      dimension: a.dimension,
      statement: a.statement,
      status: out.architecture_score >= 60 ? "passed" : out.architecture_score >= 45 ? "partial" : "failed",
      evidence: out.evidence.slice(0, 2),
      responsible_agent: "architecture",
      notes: out.architecture_score >= 60
        ? "Architecture signals support assertion."
        : "Architecture signals weak or missing.",
    }) as ValidationAssertionResult);
}

export async function runArchitecture(state: MissionState): Promise<Handoff<ArchitectureOutput>> {
  if (!state.context_pack) throw new Error("architecture: context_pack missing — run repo-scanner first");

  const user = `Validation contract dimensions: ${state.contract?.evaluation_dimensions.join(", ") ?? "n/a"}
Target role: ${state.target_role}

${buildContextBlock(state.context_pack)}

Return the JSON now.`;

  const res = await runAgentJson<ArchitectureOutput>({
    state,
    role: "worker",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 1800,
    fallback,
  });

  const out: ArchitectureOutput = {
    ...res.output,
    score_source: res.source,
  };
  out.assertion_results = deriveAssertionResults(state, out);

  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;
  state.scores.push({
    skill: "Architecture",
    score: out.architecture_score,
    evidence: out.evidence,
    confidence: res.source === "llm" ? 0.85 : res.source === "mock" ? 0.3 : 0.55,
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
