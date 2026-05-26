import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import { buildContextBlock } from "./_analysis";
import type { CodeQualityOutput, Handoff, MissionState } from "./types";

const SYSTEM = `You are the Code Quality agent of SkillProof AI.
Evaluate maintainability of the provided source snippets only. Do NOT invent files.
Return STRICT JSON:
{
  "code_quality_score": number (0-100),
  "observations": string[],
  "evidence": [{"file": string, "line": number?, "reason": string}]
}
Reward: descriptive names, bounded function size, typing, consistent error handling, no obvious dead code.
Penalize: vague names, monster files, duplicated logic, swallowed errors, magic numbers.`;

function fallback(): CodeQualityOutput {
  return {
    code_quality_score: 60,
    observations: ["LLM unavailable — heuristic score only"],
    evidence: [{ reason: "Mock mode: deterministic score returned." }],
  };
}

export async function runCodeQuality(state: MissionState): Promise<Handoff<CodeQualityOutput>> {
  if (!state.context_pack) throw new Error("code-quality: context_pack missing");
  let out: CodeQualityOutput;
  let tin = 0,
    tout = 0;

  if (isMockMode()) {
    out = fallback();
  } else {
    const user = `Target role: ${state.target_role}

${buildContextBlock(state.context_pack)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "worker", system: SYSTEM, user, maxTokens: 1800 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      out = extractJson<CodeQualityOutput>(r.text) ?? fallback();
    } catch {
      out = fallback();
    }
  }

  state.tokens_in += tin;
  state.tokens_out += tout;
  state.scores.push({
    skill: "Code Quality",
    score: out.code_quality_score,
    evidence: out.evidence,
    weaknesses: out.observations,
  });

  return {
    agent: "code-quality",
    completed: ["code_quality_analyzed"],
    unresolved: [],
    evidence: out.evidence,
    issues_found: out.observations,
    next_recommended: "testing",
    output: out,
  };
}
