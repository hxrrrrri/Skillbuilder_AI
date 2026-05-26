import type { Handoff, MissionState, SkillGraphOutput } from "./types";

// Deterministic aggregator. After validator has adjusted scores, compute the final graph.
// We do this without an LLM call to save tokens and avoid drift.

const WEIGHTS: Record<string, number> = {
  "Architecture": 15,
  "Code Quality": 15,
  "Testing": 15,
  "Debugging": 15,
  "Git Workflow": 10,
  "Documentation": 10,
  "Security": 10,
  "Communication": 5,
  "AI Collaboration": 5,
};

function roleFitLabel(overall: number, role: string): string {
  if (overall >= 80) return `Strong ${role}`;
  if (overall >= 65) return `Junior ${role}`;
  if (overall >= 50) return `Trainee ${role}`;
  return `Pre-junior ${role}`;
}

export function runSkillGraph(state: MissionState): Handoff<SkillGraphOutput> {
  // Aggregate score claims by skill (last value wins; validator already adjusted).
  const bySkill = new Map<string, { score: number; evidence: any[]; confidence: number }>();
  for (const claim of state.scores) {
    bySkill.set(claim.skill, {
      score: claim.score,
      evidence: claim.evidence,
      confidence: 0.85,
    });
  }

  // Fill missing skills with neutral 50.
  const required = ["Architecture", "Code Quality", "Testing", "Security", "Git Workflow", "Debugging", "Communication"];
  for (const s of required) {
    if (!bySkill.has(s)) {
      bySkill.set(s, { score: 50, evidence: [{ reason: "Not directly evaluated — neutral default." }], confidence: 0.4 });
    }
  }

  // Weighted overall.
  let totalWeight = 0;
  let weighted = 0;
  for (const [skill, info] of bySkill) {
    const w = WEIGHTS[skill] ?? 5;
    totalWeight += w;
    weighted += info.score * w;
  }
  const overall = Math.round(weighted / Math.max(totalWeight, 1));

  // Strengths / growth.
  const sorted = [...bySkill.entries()].sort((a, b) => b[1].score - a[1].score);
  const top_strengths = sorted.slice(0, 3).map(([k]) => k);
  const growth_areas = sorted.slice(-3).map(([k]) => k).reverse();

  const out: SkillGraphOutput = {
    overall_score: overall,
    role_fit: roleFitLabel(overall, state.target_role),
    top_strengths,
    growth_areas,
    skill_graph: [...bySkill.entries()].map(([name, info]) => ({
      name,
      score: info.score,
      confidence: info.confidence,
      evidence: info.evidence,
    })),
  };

  return {
    agent: "skill-graph",
    completed: ["skill_graph_built"],
    unresolved: [],
    evidence: [{ reason: `Overall ${overall}/100 across ${bySkill.size} dimensions.` }],
    issues_found: [],
    next_recommended: "profile-gen",
    output: out,
  };
}
