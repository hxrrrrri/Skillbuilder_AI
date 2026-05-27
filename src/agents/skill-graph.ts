// Deterministic aggregator. Weighted rubric. Skills with no claim are reported "not measured" — never silently 50.

import type { Handoff, MissionState, ScoreSource, SkillGraphOutput } from "./types";

export const RUBRIC_WEIGHTS: Record<string, number> = {
  "Code Quality": 15,
  "Architecture": 15,
  "Testing": 15,
  "Debugging": 15,
  "Git Workflow": 10,
  "Documentation": 10,
  "Security": 10,
  "Communication": 5,
  "AI Collaboration": 5,
};

// Authenticity is shown alongside but not added to overall score by default.
const COSMETIC_SKILLS = new Set(["Authenticity", "Understanding of Own Code"]);

function roleFitLabel(overall: number, role: string): string {
  if (overall >= 80) return `Strong ${role}`;
  if (overall >= 65) return `Junior ${role}`;
  if (overall >= 50) return `Trainee ${role}`;
  return `Pre-junior ${role}`;
}

export function runSkillGraph(state: MissionState): Handoff<SkillGraphOutput> {
  // Aggregate by skill — last value wins (validator already adjusted in place).
  const bySkill = new Map<
    string,
    { score: number; evidence: any[]; confidence: number; source: ScoreSource; assertion_ids?: string[] }
  >();
  for (const claim of state.scores) {
    bySkill.set(claim.skill, {
      score: claim.score,
      evidence: claim.evidence,
      confidence: claim.confidence ?? 0.8,
      source: claim.source ?? "heuristic",
      assertion_ids: claim.assertion_ids,
    });
  }

  const rubricSkills = Object.keys(RUBRIC_WEIGHTS);
  const not_measured: string[] = [];

  // Build graph entries — null score for skills with no claim.
  const graphEntries = rubricSkills.map((name) => {
    const info = bySkill.get(name);
    if (!info) {
      not_measured.push(name);
      return {
        name,
        score: null,
        confidence: 0,
        source: "pending" as ScoreSource,
        evidence: [{ reason: "Not measured yet — pending interview or challenge submission." }],
        weight: RUBRIC_WEIGHTS[name],
        assertion_ids: [],
      };
    }
    return {
      name,
      score: info.score,
      confidence: info.confidence,
      source: info.source,
      evidence: info.evidence,
      weight: RUBRIC_WEIGHTS[name],
      assertion_ids: info.assertion_ids ?? [],
    };
  });

  // Add cosmetic skills (authenticity) at the end without rubric weight.
  for (const [skill, info] of bySkill) {
    if (!COSMETIC_SKILLS.has(skill)) continue;
    if (graphEntries.find((e) => e.name === skill)) continue;
    graphEntries.push({
      name: skill,
      score: info.score,
      confidence: info.confidence,
      source: info.source,
      evidence: info.evidence,
      weight: 0,
      assertion_ids: info.assertion_ids ?? [],
    });
  }

  // Weighted overall — exclude not-measured from denominator.
  let totalWeight = 0;
  let weighted = 0;
  for (const e of graphEntries) {
    if (e.score == null) continue;
    if (e.weight === 0) continue;
    totalWeight += e.weight;
    weighted += e.score * e.weight;
  }
  const overall = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;

  const measured = graphEntries.filter((e) => e.score != null && e.weight > 0) as Array<typeof graphEntries[number] & { score: number }>;
  const sorted = [...measured].sort((a, b) => b.score - a.score);
  const top_strengths = sorted.slice(0, 3).map((e) => e.name);
  const growth_areas = sorted.slice(-3).map((e) => e.name).reverse();

  const out: SkillGraphOutput = {
    overall_score: overall,
    role_fit: roleFitLabel(overall, state.target_role),
    top_strengths,
    growth_areas,
    skill_graph: graphEntries,
    not_measured,
  };

  return {
    agent: "skill-graph",
    completed: ["skill_graph_built"],
    unresolved: not_measured.length ? [`${not_measured.length} dimensions not measured.`] : [],
    evidence: [{ reason: `Overall ${overall}/100 across ${measured.length} measured dimensions.` }],
    issues_found: not_measured.length ? [`Not measured: ${not_measured.join(", ")}`] : [],
    next_recommended: "profile-gen",
    output: out,
  };
}

// Used by interview-evaluate route to recompute overall after interview answer.
export function recomputeOverall(scores: Array<{ skillName: string; score: number }>): {
  overall: number;
  notMeasured: string[];
} {
  const map = new Map(scores.map((s) => [s.skillName, s.score]));
  let totalWeight = 0;
  let weighted = 0;
  const notMeasured: string[] = [];
  for (const [skill, weight] of Object.entries(RUBRIC_WEIGHTS)) {
    const v = map.get(skill);
    if (v == null) {
      notMeasured.push(skill);
      continue;
    }
    totalWeight += weight;
    weighted += v * weight;
  }
  return {
    overall: totalWeight > 0 ? Math.round(weighted / totalWeight) : 0,
    notMeasured,
  };
}
