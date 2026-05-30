import { describe, expect, it } from "vitest";
import type { MissionState, RepoContextPack } from "@/agents/types";
import { selectContextForAgent } from "./select-context";

function pack(overrides: Partial<RepoContextPack> = {}): RepoContextPack {
  return {
    meta: {
      owner: "skillproof",
      repo: "demo",
      defaultBranch: "main",
      description: "demo",
      primaryLanguage: "TypeScript",
      sizeKB: 10,
      stars: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      topics: [],
    },
    detected: {
      framework: "next",
      packageManager: "npm",
      testFramework: "vitest",
      hasCI: true,
      hasDocker: false,
      hasTypeScript: true,
    },
    filesIndex: {
      total: 3,
      all: ["README.md", "src/service.ts", "src/service.test.ts"],
      important: ["src/service.ts", "README.md"],
      config: [],
      tests: ["src/service.test.ts"],
      ci: [".github/workflows/test.yml"],
      readme: "README.md",
    },
    snippets: [
      { path: "README.md", content: "Project documentation", truncated: false },
      { path: "src/service.ts", content: "export function run() { return true; }", truncated: false },
      { path: "src/service.test.ts", content: "it('runs', () => expect(run()).toBe(true));", truncated: false },
    ],
    commits: [],
    tokens: { rawEstimate: 100, packEstimate: 50 },
    ...overrides,
  };
}

function state(overrides: Partial<MissionState> = {}): MissionState {
  return {
    mission_id: "mission_test",
    run_id: "run_test",
    target_role: "Backend Engineer",
    candidate_level: "mid",
    contract: null,
    context_pack: pack(),
    scores: [],
    handoffs: [],
    assertion_results: [],
    tokens_in: 0,
    tokens_out: 0,
    mock_mode: false,
    execution_mode: "api",
    ...overrides,
  };
}

describe("selectContextForAgent", () => {
  it("returns empty context for deterministic stages", () => {
    const selected = selectContextForAgent(state(), "repo-scanner");

    expect(selected.text).toBe("");
    expect(selected.estimatedInputTokens).toBe(0);
    expect(selected.budget.maxInputTokens).toBe(0);
  });

  it("selects dimension-relevant snippets instead of the full repo dump", () => {
    const selected = selectContextForAgent(state(), "testing");

    expect(selected.text).toContain("src/service.test.ts");
    expect(selected.text).not.toContain("--- src/service.ts");
    expect(selected.text).not.toContain("--- README.md");
    expect(selected.text).not.toContain("Default branch:");
  });

  it("truncates selected context to the agent input budget", () => {
    const contextPack = pack({
      snippets: [{ path: "src/huge.ts", content: "x".repeat(50_000), truncated: false }],
    });
    const selected = selectContextForAgent(state({ context_pack: contextPack }), "code-quality");

    expect(selected.truncated).toBe(true);
    expect(selected.estimatedInputTokens).toBeLessThanOrEqual(selected.budget.maxInputTokens);
  });

  it("escalates security to the strong tier when deterministic risk flags exist", () => {
    const contextPack = pack({
      intelligence: {
        riskFlags: [{ severity: "high", reason: "possible secret", file: ".env" }],
      } as any,
    });

    expect(selectContextForAgent(state({ context_pack: contextPack }), "security").budget.modelTier).toBe("strong");
  });

  it("gives the validator compact claim and evidence tables", () => {
    const selected = selectContextForAgent(
      state({
        scores: [
          {
            skill: "Testing",
            score: 72,
            confidence: 0.8,
            source: "llm",
            assertion_ids: ["A1"],
            evidence: [{ file: "src/service.test.ts", line: 4, reason: "A focused test exists." }],
          },
        ],
      }),
      "validator",
    );

    expect(selected.text).toContain("## Claims to audit");
    expect(selected.text).toContain("| Testing | 72 | 0.80 | llm | 1 | A1 |");
    expect(selected.text).toContain("ev_cetestts_1");
  });
});
