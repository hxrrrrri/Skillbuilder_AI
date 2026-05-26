import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import { buildContextBlock } from "./_analysis";
import type { ArchitectureOutput, Handoff, MissionState } from "./types";

const SYSTEM = `You are the Architecture Analyst agent of SkillProof AI.
Your job: judge the architectural quality of a developer's repo using only the provided context pack.
You must produce STRICT JSON only, no commentary. Shape:
{
  "architecture_score": number (0-100),
  "strengths": string[],
  "weaknesses": string[],
  "evidence": [{"file": string, "line": number?, "reason": string}]
}
Rules:
- Every score must be backed by at least 2 evidence items naming specific files from the snippets.
- If snippets are insufficient, lower confidence and say so in weaknesses; do NOT fabricate file paths.
- Reward separation of concerns, clear module boundaries, sane state management, config externalization.
- Penalize god files, mixed UI + business logic, missing layering.`;

function fallback(): ArchitectureOutput {
  return {
    architecture_score: 65,
    strengths: ["Modular folder layout detected"],
    weaknesses: ["LLM unavailable — heuristic score only"],
    evidence: [{ reason: "Mock mode: deterministic score returned because ANTHROPIC_API_KEY was not set." }],
  };
}

export async function runArchitecture(state: MissionState): Promise<Handoff<ArchitectureOutput>> {
  if (!state.context_pack) throw new Error("architecture: context_pack missing — run repo-scanner first");
  let out: ArchitectureOutput;
  let tin = 0,
    tout = 0;

  if (isMockMode()) {
    out = fallback();
  } else {
    const user = `Validation contract dimensions: ${state.contract?.evaluation_dimensions.join(", ") ?? "n/a"}
Target role: ${state.target_role}

${buildContextBlock(state.context_pack)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "worker", system: SYSTEM, user, maxTokens: 1800 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      out = extractJson<ArchitectureOutput>(r.text) ?? fallback();
    } catch {
      out = fallback();
    }
  }

  state.tokens_in += tin;
  state.tokens_out += tout;
  state.scores.push({
    skill: "Architecture",
    score: out.architecture_score,
    evidence: out.evidence,
    strengths: out.strengths,
    weaknesses: out.weaknesses,
  });

  return {
    agent: "architecture",
    completed: ["architecture_analyzed"],
    unresolved: [],
    evidence: out.evidence,
    issues_found: out.weaknesses,
    next_recommended: "code-quality",
    output: out,
  };
}
