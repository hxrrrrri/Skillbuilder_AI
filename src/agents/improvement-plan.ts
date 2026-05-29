import { runAgentJson } from "@/lib/providers/run-agent";
import type { Handoff, ImprovementPlan, MissionState, SkillGraphOutput } from "./types";

const SYSTEM = `You are the Improvement Plan agent for SkillProof AI.
Create a concrete improvement plan from measured evidence and growth areas. Do not claim unverified abilities.
Return STRICT JSON:
{
  "seven_day": string[],
  "thirty_day": [{"week": number, "title": string, "detail": string, "files": string[]?}],
  "recommended_tests": string[],
  "git_hygiene": string[]
}`;

const SCHEMA_HINT = '{"seven_day":string[],"thirty_day":[{"week":number,"title":string,"detail":string,"files":string[]}],"recommended_tests":string[],"git_hygiene":string[]}';

function normalize(state: MissionState, graph: SkillGraphOutput, raw: ImprovementPlan): ImprovementPlan {
  const importantFiles = state.context_pack?.filesIndex.important.slice(0, 4) ?? [];
  return {
    seven_day: (raw.seven_day?.length ? raw.seven_day : graph.growth_areas.map((area) => `Add evidence for ${area}.`)).slice(0, 7),
    thirty_day: (raw.thirty_day?.length
      ? raw.thirty_day
      : [
          { week: 1, title: "Test critical paths", detail: "Add automated tests for the most important source files.", files: importantFiles },
          { week: 2, title: "Document architecture", detail: "Explain the main modules and setup flow in README." },
          { week: 3, title: "Harden validation", detail: "Add input validation at external boundaries." },
          { week: 4, title: "Improve reviewability", detail: "Keep commits small and attach evidence to changes." },
        ]).slice(0, 4),
    recommended_tests: (raw.recommended_tests?.length ? raw.recommended_tests : importantFiles.map((f) => `Add a focused test for ${f}.`)).slice(0, 8),
    git_hygiene: (raw.git_hygiene?.length ? raw.git_hygiene : ["Use small commits with clear messages.", "Keep CI green before sharing a profile."]).slice(0, 6),
  };
}

export async function runImprovementPlan(state: MissionState, graph: SkillGraphOutput): Promise<Handoff<ImprovementPlan>> {
  const res = await runAgentJson<ImprovementPlan>({
    state,
    agentName: "improvement-plan",
    role: "profile",
    system: SYSTEM,
    user: `Skill graph:\n${JSON.stringify(graph, null, 2)}\n\nRepo files:\n${JSON.stringify(state.context_pack?.filesIndex.important.slice(0, 20) ?? [])}\n\nReturn the improvement-plan JSON now.`,
    schemaHint: SCHEMA_HINT,
    maxTokens: 1200,
    temperature: 0.2,
  });
  const out = normalize(state, graph, res.output);
  state.improvementPlan = out;
  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;
  return {
    agent: "improvement-plan",
    completed: ["improvement_plan_built"],
    unresolved: [],
    evidence: [{ reason: `Improvement plan generated from ${graph.skill_graph.filter((s) => s.score != null).length} measured skill dimensions.` }, { reason: `provider=${res.provider} model=${res.model}` }],
    issues_found: [],
    next_recommended: "profile-gen",
    output: out,
  };
}
