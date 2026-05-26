import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import { buildContextBlock } from "./_analysis";
import type {
  CodeQualityOutput,
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

function fallback(): CodeQualityOutput {
  return {
    code_quality_score: 55,
    observations: ["LLM unavailable — heuristic score only"],
    evidence: [{ reason: "Heuristic mode: deterministic score returned." }],
    score_source: "heuristic",
  };
}

function deriveAssertionResults(state: MissionState, out: CodeQualityOutput): ValidationAssertionResult[] {
  const contract = state.contract;
  if (!contract) return [];
  return contract.assertions
    .filter((a) => a.dimension === "code_quality")
    .map((a) => ({
      assertion_id: a.id,
      dimension: a.dimension,
      statement: a.statement,
      status: out.code_quality_score >= 60 ? "passed" : out.code_quality_score >= 45 ? "partial" : "failed",
      evidence: out.evidence.slice(0, 2),
      responsible_agent: "code-quality",
      notes: out.code_quality_score >= 60 ? "Snippets show reasonable quality." : "Quality issues detected.",
    }) as ValidationAssertionResult);
}

export async function runCodeQuality(state: MissionState): Promise<Handoff<CodeQualityOutput>> {
  if (!state.context_pack) throw new Error("code-quality: context_pack missing");
  let out: CodeQualityOutput;
  let tin = 0, tout = 0;

  if (isMockMode()) {
    out = { ...fallback(), score_source: state.mock_mode ? "mock" : "heuristic" };
  } else {
    const user = `Target role: ${state.target_role}

${buildContextBlock(state.context_pack)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "worker", system: SYSTEM, user, maxTokens: 1800 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      const parsed = extractJson<CodeQualityOutput>(r.text);
      out = parsed ? { ...parsed, score_source: "llm" } : { ...fallback(), score_source: "heuristic" };
    } catch {
      out = { ...fallback(), score_source: "heuristic" };
    }
  }

  out.assertion_results = deriveAssertionResults(state, out);

  state.tokens_in += tin;
  state.tokens_out += tout;
  state.scores.push({
    skill: "Code Quality",
    score: out.code_quality_score,
    evidence: out.evidence,
    confidence: out.score_source === "llm" ? 0.85 : out.score_source === "mock" ? 0.3 : 0.55,
    source: out.score_source ?? "heuristic",
    weaknesses: out.observations,
    assertion_ids: out.assertion_results.map((a) => a.assertion_id),
  });
  state.assertion_results.push(...(out.assertion_results ?? []));

  return {
    agent: "code-quality",
    completed: ["code_quality_analyzed"],
    unresolved: [],
    evidence: out.evidence,
    issues_found: out.observations,
    next_recommended: "testing",
    assertion_results: out.assertion_results,
    output: out,
  };
}
