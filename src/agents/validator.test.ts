import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claude", () => ({
  isMockMode: () => true,
  llmCall: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("@/lib/providers/run-agent", () => ({
  runAgentJson: vi.fn(async (opts: any) => ({
    output: {
      validated: true,
      confidence: 0.9,
      unsupported_claims_removed: 0,
      adjusted_scores: [],
      hallucinated_files: [],
      notes: ["test provider output"],
      assertion_coverage: [],
    },
    provider: "anthropic_api",
    model: "claude-test",
    inputTokens: 0,
    outputTokens: 0,
    source: "llm",
  })),
}));

import { runValidator } from "./validator";
import type { MissionState, ValidationContract } from "./types";

function makeState(overrides: Partial<MissionState> = {}): MissionState {
  const contract: ValidationContract = {
    mission_id: "m1",
    target_role: "dev",
    candidate_level: "Junior",
    evaluation_dimensions: ["architecture"],
    assertions: [
      {
        id: "A1",
        dimension: "architecture",
        statement: "x",
        weight: 5,
        detector: "static",
        required_evidence: 1,
      },
    ],
    rubric: { architecture: { weight: 15, passingScore: 60 } },
  };
  return {
    mission_id: "m1",
    run_id: "r1",
    target_role: "dev",
    candidate_level: "Junior",
    contract,
    context_pack: {
      meta: {} as any,
      detected: {} as any,
      filesIndex: {
        total: 3,
        all: ["src/app.ts", "src/util.ts", "README.md"],
        important: ["src/app.ts"],
        config: [],
        tests: [],
        ci: [],
        readme: "README.md",
      },
      snippets: [],
      commits: [],
      tokens: { rawEstimate: 0, packEstimate: 0 },
    },
    scores: [],
    handoffs: [],
    assertion_results: [],
    authenticity: null,
    tokens_in: 0,
    tokens_out: 0,
    mock_mode: true,
    execution_mode: "local",
    provider_matrix: null,
    terminal_evidence: [],
    ownership_status: null,
    ...overrides,
  };
}

describe("validator deterministic evidence audit", () => {
  it("lowers score with no evidence to <=55", async () => {
    const state = makeState();
    state.scores.push({ skill: "Architecture", score: 90, evidence: [] });
    const h = await runValidator(state);
    const adj = h.output.adjusted_scores.find((a) => a.skill === "Architecture");
    expect(adj).toBeDefined();
    expect(adj!.after).toBeLessThanOrEqual(55);
    expect(state.scores[0].score).toBeLessThanOrEqual(55);
  });

  it("flags hallucinated files using filesIndex.all as truth set", async () => {
    const state = makeState();
    state.scores.push({
      skill: "Architecture",
      score: 80,
      evidence: [{ file: "src/imaginary.ts", reason: "uses imaginary module" }],
    });
    const h = await runValidator(state);
    expect(h.output.hallucinated_files).toContain("src/imaginary.ts");
    expect(state.scores[0].score).toBeLessThan(80);
  });

  it("accepts files that ARE in the repo tree (filesIndex.all not just snippets)", async () => {
    const state = makeState();
    state.scores.push({
      skill: "Architecture",
      score: 70,
      evidence: [{ file: "src/util.ts", reason: "util module exists in tree" }],
    });
    const h = await runValidator(state);
    expect(h.output.hallucinated_files).not.toContain("src/util.ts");
    // No adjustment expected because file is in tree and score is <= 85
    const adj = h.output.adjusted_scores.find((a) => a.skill === "Architecture");
    expect(adj).toBeUndefined();
    expect(state.scores[0].score).toBe(70);
  });

  it("caps any score > 85 to 85", async () => {
    const state = makeState();
    state.scores.push({
      skill: "Architecture",
      score: 95,
      evidence: [{ file: "src/app.ts", reason: "real evidence" }],
    });
    const h = await runValidator(state);
    const adj = h.output.adjusted_scores.find((a) => a.skill === "Architecture");
    expect(adj?.after).toBe(85);
    expect(state.scores[0].score).toBe(85);
  });

  it("marks uncovered contract assertions as unknown", async () => {
    const state = makeState();
    const h = await runValidator(state);
    expect(h.output.assertion_coverage.length).toBeGreaterThan(0);
    expect(h.output.assertion_coverage[0].status).toBe("unknown");
  });
});
