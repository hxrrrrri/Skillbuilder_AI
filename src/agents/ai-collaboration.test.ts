import { describe, expect, it } from "vitest";
import { runAICollaborationReview } from "./ai-collaboration";
import type { MissionState, RepoContextPack } from "./types";

function pack(overrides: Partial<RepoContextPack> = {}): RepoContextPack {
  return {
    meta: {
      owner: "alice",
      repo: "app",
      defaultBranch: "main",
      description: null,
      primaryLanguage: "TypeScript",
      sizeKB: 1,
      stars: 0,
      createdAt: "",
      updatedAt: "",
      topics: [],
    },
    detected: {
      framework: "next",
      packageManager: "npm",
      testFramework: "vitest",
      hasCI: false,
      hasDocker: false,
      hasTypeScript: true,
    },
    filesIndex: {
      total: 1,
      all: ["src/app.ts"],
      important: ["src/app.ts"],
      config: [],
      tests: [],
      ci: [],
      readme: null,
    },
    snippets: [],
    commits: [],
    tokens: { rawEstimate: 0, packEstimate: 0 },
    ...overrides,
  };
}

function state(contextPack: RepoContextPack): MissionState {
  return {
    mission_id: "m1",
    run_id: "r1",
    target_role: "Full-stack developer",
    candidate_level: "junior",
    contract: null,
    context_pack: contextPack,
    scores: [],
    handoffs: [],
    assertion_results: [],
    authenticity: null,
    aiCollaboration: null,
    tokens_in: 0,
    tokens_out: 0,
    mock_mode: true,
    execution_mode: "local",
    provider_matrix: null,
    provider_runtime: {},
    terminal_evidence: [],
    ownership_status: null,
  };
}

describe("runAICollaborationReview", () => {
  it("does not generate a score when evidence is insufficient", async () => {
    const s = state(pack());
    const handoff = await runAICollaborationReview(s);
    expect(handoff.output.aiCollaborationScore).toBeNull();
    expect(s.scores.some((score) => score.skill === "AI Collaboration")).toBe(false);
    expect(handoff.unresolved).toContain("AI collaboration evidence insufficient.");
  });

  it("generates an evidence-backed AI collaboration score when verification evidence exists", async () => {
    const s = state(
      pack({
        commits: [{ sha: "abc", message: "Refine AI generated parser with tests", author: "Alice", date: "" }],
      }),
    );
    s.terminal_evidence = [
      {
        command: "npm test",
        cwd: ".skillproof/runs/r1",
        exitCode: 0,
        stdoutSummary: "pass",
        stderrSummary: "",
        durationMs: 100,
        usedFor: "testing",
      },
    ];
    const handoff = await runAICollaborationReview(s);
    expect(handoff.output.aiCollaborationScore).toBeGreaterThan(0);
    expect(handoff.evidence.length).toBeGreaterThan(0);
    expect(s.scores.find((score) => score.skill === "AI Collaboration")?.evidence.length).toBeGreaterThan(0);
  });
});
