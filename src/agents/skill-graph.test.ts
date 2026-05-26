import { describe, expect, it } from "vitest";
import { recomputeOverall, runSkillGraph, RUBRIC_WEIGHTS } from "./skill-graph";
import type { MissionState } from "./types";

function makeState(scoresIn: Array<{ skill: string; score: number; source?: any }>): MissionState {
  return {
    mission_id: "m",
    run_id: "r",
    target_role: "dev",
    candidate_level: "Junior",
    contract: null,
    context_pack: null,
    scores: scoresIn.map((s) => ({
      skill: s.skill,
      score: s.score,
      evidence: [{ reason: "test" }],
      confidence: 0.8,
      source: s.source ?? "llm",
    })),
    handoffs: [],
    assertion_results: [],
    authenticity: null,
    tokens_in: 0,
    tokens_out: 0,
    mock_mode: false,
  };
}

describe("skill-graph", () => {
  it("computes weighted overall excluding not-measured", () => {
    const state = makeState([
      { skill: "Architecture", score: 80 },
      { skill: "Code Quality", score: 80 },
    ]);
    const h = runSkillGraph(state);
    expect(h.output.overall_score).toBe(80);
    expect(h.output.not_measured.length).toBeGreaterThan(0);
  });

  it("marks missing skills as not_measured (no silent 50)", () => {
    const state = makeState([{ skill: "Architecture", score: 80 }]);
    const h = runSkillGraph(state);
    expect(h.output.not_measured).toContain("Testing");
    const testEntry = h.output.skill_graph.find((s) => s.name === "Testing");
    expect(testEntry?.score).toBeNull();
    expect(testEntry?.source).toBe("pending");
  });

  it("recomputeOverall uses the same weights", () => {
    const r = recomputeOverall([
      { skillName: "Architecture", score: 80 },
      { skillName: "Code Quality", score: 80 },
    ]);
    expect(r.overall).toBe(80);
  });

  it("rubric weights sum to 100", () => {
    const sum = Object.values(RUBRIC_WEIGHTS).reduce((s, n) => s + n, 0);
    expect(sum).toBe(100);
  });
});
