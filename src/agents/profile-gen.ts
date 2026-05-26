import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import type {
  EmployerVerifier,
  Handoff,
  ImprovementPlan,
  MissionState,
  ProfileOutput,
  SkillGraphOutput,
} from "./types";

const SYSTEM = `You are the Profile Generator agent of SkillProof AI.
Produce a recruiter-readable verified profile from the skill graph and evidence.
Return STRICT JSON:
{
  "developer_summary": string (2-3 sentences),
  "verified_skills": string[],
  "improvement_areas": string[],
  "employer_recommendation": string (1-2 sentences),
  "evidence_highlights": [{"file": string?, "reason": string}],
  "employer_verifier": {
    "hiring_recommendation": "Strong shortlist" | "Consider with reservations" | "Needs more proof",
    "top_verified_skills": string[],
    "biggest_risks": string[],
    "best_evidence": [{"file": string?, "reason": string}],
    "suggested_followup_questions": string[],
    "role_fit_summary": string
  },
  "improvement_plan": {
    "seven_day": string[],
    "thirty_day": [{"week": number, "title": string, "detail": string, "files": string[]?}],
    "recommended_tests": string[],
    "git_hygiene": string[]
  }
}
Tone: factual, evidence-grounded, no hype.`;

function hiringRecFromScore(score: number): EmployerVerifier["hiring_recommendation"] {
  if (score >= 75) return "Strong shortlist";
  if (score >= 55) return "Consider with reservations";
  return "Needs more proof";
}

function fallbackImprovementPlan(state: MissionState, graph: SkillGraphOutput): ImprovementPlan {
  const pack = state.context_pack;
  const filesForTests = (pack?.filesIndex.important ?? []).slice(0, 3);
  const lacksTests = graph.skill_graph.find((s) => s.name === "Testing" && (s.score ?? 0) < 60);
  const lacksCI = !pack?.detected.hasCI;
  const lacksDocs = graph.skill_graph.find((s) => s.name === "Documentation" && (s.score ?? 0) < 60);

  return {
    seven_day: [
      lacksTests ? "Add at least one unit test per critical utility." : "Add an integration test for a route handler.",
      "Clean up any vague commit messages on next push (conventional commits)." ,
      lacksDocs ? "Expand README with project-specific Setup + Architecture sections." : "Document one tricky decision in README.",
    ],
    thirty_day: [
      { week: 1, title: "Tests for utilities", detail: "Cover at least 3 helper functions with assertions.", files: filesForTests },
      { week: 2, title: lacksCI ? "Add CI workflow" : "Tighten CI", detail: lacksCI ? "Add .github/workflows/ci.yml running tests on PR." : "Cache deps, add type-check job." },
      { week: 3, title: "Refactor god file", detail: "Split the largest file in src/ into modules with single responsibilities." },
      { week: 4, title: "Error boundaries + input validation", detail: "Add zod or equivalent at all external boundaries." },
    ],
    recommended_tests: filesForTests.map((f) => `Add tests for ${f}.`),
    git_hygiene: [
      "Use conventional commit prefixes (feat:, fix:, chore:).",
      "Avoid single mega-commits — prefer small, reviewable diffs.",
    ],
  };
}

function fallback(state: MissionState, graph: SkillGraphOutput): ProfileOutput {
  const overall = graph.overall_score;
  const rec = hiringRecFromScore(overall);
  return {
    developer_summary: `${graph.role_fit} with an overall SkillProof score of ${overall}/100. Strongest in ${graph.top_strengths.join(", ") || "(no strong area)"}.`,
    verified_skills: graph.top_strengths,
    improvement_areas: graph.growth_areas,
    employer_recommendation: `${rec}. Verify ${graph.growth_areas[0] ?? "testing"} depth in a follow-up before production-critical assignments.`,
    evidence_highlights: graph.skill_graph.flatMap((s) => s.evidence.slice(0, 1)).slice(0, 6),
    employer_verifier: {
      hiring_recommendation: rec,
      top_verified_skills: graph.top_strengths,
      biggest_risks: [
        ...(graph.not_measured.length ? [`Not measured: ${graph.not_measured.join(", ")}.`] : []),
        ...(state.authenticity?.risk_signals ?? []).slice(0, 3),
      ],
      best_evidence: graph.skill_graph.flatMap((s) => s.evidence.slice(0, 1)).slice(0, 4),
      suggested_followup_questions: [
        `Walk through your testing strategy for the ${graph.growth_areas[0] ?? "weakest"} area.`,
        "Describe a debugging session you ran in this repo end-to-end.",
        "What would you refactor first if you had a free day?",
      ],
      role_fit_summary: `${rec} for ${state.target_role} at ${state.candidate_level} level.`,
    },
    improvement_plan: fallbackImprovementPlan(state, graph),
  };
}

export async function runProfileGen(state: MissionState, graph: SkillGraphOutput): Promise<Handoff<ProfileOutput>> {
  let out: ProfileOutput;
  let tin = 0, tout = 0;

  if (isMockMode()) {
    out = fallback(state, graph);
  } else {
    const user = `Skill graph:
${JSON.stringify(graph, null, 2)}

Target role: ${state.target_role}
Candidate level: ${state.candidate_level}
Authenticity signals: ${JSON.stringify(state.authenticity ?? null)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "worker", system: SYSTEM, user, maxTokens: 2200 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      out = extractJson<ProfileOutput>(r.text) ?? fallback(state, graph);
      // Patch missing nested if the model skipped them.
      if (!out.employer_verifier) out.employer_verifier = fallback(state, graph).employer_verifier;
      if (!out.improvement_plan) out.improvement_plan = fallback(state, graph).improvement_plan;
    } catch {
      out = fallback(state, graph);
    }
  }

  state.tokens_in += tin;
  state.tokens_out += tout;

  return {
    agent: "profile-gen",
    completed: ["public_profile_drafted", "employer_verifier_built", "improvement_plan_built"],
    unresolved: [],
    evidence: out.evidence_highlights,
    issues_found: [],
    output: out,
  };
}
