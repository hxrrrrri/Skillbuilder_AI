import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import type { Handoff, MissionState, ProfileOutput, SkillGraphOutput } from "./types";

const SYSTEM = `You are the Profile Generator agent of SkillProof AI.
Produce a concise, recruiter-readable verified profile from the skill graph and evidence.
Return STRICT JSON:
{
  "developer_summary": string (2-3 sentences),
  "verified_skills": string[],
  "improvement_areas": string[],
  "employer_recommendation": string (1-2 sentences),
  "evidence_highlights": [{"file": string?, "reason": string}]
}
Tone: factual, evidence-grounded, no hype. Do not invent skills not in the graph.`;

function fallback(graph: SkillGraphOutput): ProfileOutput {
  return {
    developer_summary: `${graph.role_fit} with an overall SkillProof score of ${graph.overall_score}/100. Strongest in ${graph.top_strengths.join(", ")}.`,
    verified_skills: graph.top_strengths,
    improvement_areas: graph.growth_areas,
    employer_recommendation: `Candidate demonstrates real project-building ability. Verify ${graph.growth_areas[0] ?? "testing"} depth before production-critical assignments.`,
    evidence_highlights: graph.skill_graph.flatMap((s) => s.evidence.slice(0, 1)).slice(0, 6),
  };
}

export async function runProfileGen(state: MissionState, graph: SkillGraphOutput): Promise<Handoff<ProfileOutput>> {
  let out: ProfileOutput;
  let tin = 0,
    tout = 0;

  if (isMockMode()) {
    out = fallback(graph);
  } else {
    const user = `Skill graph JSON:
${JSON.stringify(graph, null, 2)}

Target role: ${state.target_role}
Candidate level: ${state.candidate_level}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "worker", system: SYSTEM, user, maxTokens: 1200 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      out = extractJson<ProfileOutput>(r.text) ?? fallback(graph);
    } catch {
      out = fallback(graph);
    }
  }

  state.tokens_in += tin;
  state.tokens_out += tout;

  return {
    agent: "profile-gen",
    completed: ["public_profile_drafted"],
    unresolved: [],
    evidence: out.evidence_highlights,
    issues_found: [],
    output: out,
  };
}
