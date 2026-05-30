import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionState } from "@/agents/types";
import type { ProviderMatrix, ProviderMatrixAgentEntry } from "./types";

const runWithMatrix = vi.fn();
const getActivePrompt = vi.fn();

vi.mock("./provider-router", () => ({
  AgentSkippedError: class AgentSkippedError extends Error {},
  selectProviderMatrix: vi.fn(),
  runWithMatrix,
}));

vi.mock("./registry", () => ({
  getActivePrompt,
}));

function entry(): ProviderMatrixAgentEntry {
  return {
    provider: "anthropic_api",
    model: "claude-test",
    reasoningBudget: "medium",
    enabled: true,
    fallbackProvider: null,
    fallbackModel: null,
    fallbackStrategy: "fail",
    temperature: 0.2,
    maxTokens: 4000,
    jsonMode: true,
    timeoutMs: 60_000,
    retryCount: 1,
    source: "db",
    status: "planned",
  };
}

function matrix(): ProviderMatrix {
  return {
    orchestrator: "anthropic_api",
    worker: "anthropic_api",
    validator: "anthropic_api",
    interview: "anthropic_api",
    profile: "anthropic_api",
    agents: { architecture: entry() },
  };
}

function state(): MissionState {
  return {
    mission_id: "mission_test",
    run_id: "run_test",
    target_role: "Backend Engineer",
    candidate_level: "mid",
    contract: null,
    context_pack: {
      meta: {
        owner: "skillproof",
        repo: "demo",
        defaultBranch: "main",
        description: null,
        primaryLanguage: "TypeScript",
        sizeKB: 10,
        stars: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
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
        total: 1,
        all: ["src/service.ts"],
        important: ["src/service.ts"],
        config: [],
        tests: [],
        ci: [],
        readme: null,
      },
      snippets: [{ path: "src/service.ts", content: "export const ok = true;", truncated: false }],
      commits: [],
      tokens: { rawEstimate: 100, packEstimate: 50 },
    },
    scores: [],
    handoffs: [],
    assertion_results: [],
    tokens_in: 0,
    tokens_out: 0,
    mock_mode: false,
    execution_mode: "api",
    provider_matrix: matrix(),
    provider_runtime: {},
  };
}

describe("runAgentJson token budgets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActivePrompt.mockResolvedValue(null);
    runWithMatrix.mockImplementation(async (_matrix, _role, prompt) => ({
      json: { ok: true },
      raw: '{"ok":true}',
      provider: "anthropic_api",
      model: "claude-test",
      inputTokens: 12,
      outputTokens: 34,
      runtime: entry(),
      prompt,
    }));
  });

  it("injects focused context when requested and caps provider output tokens", async () => {
    const { runAgentJson } = await import("./run-agent");
    const result = await runAgentJson<{ ok: boolean }>({
      state: state(),
      agentName: "architecture",
      role: "worker",
      system: "system",
      user: "Return JSON now.",
      schemaHint: '{"ok":boolean}',
      maxTokens: 9000,
      useSelectedContext: true,
    });

    const sentPrompt = runWithMatrix.mock.calls[0][2];
    expect(sentPrompt.user).toContain("## Repo intelligence (deterministic)");
    expect(sentPrompt.user).toContain("--- src/service.ts");
    expect(sentPrompt.user).toContain("Return JSON now.");
    expect(sentPrompt.maxTokens).toBe(900);
    expect(result.runtime?.plannedInputTokens).toBe(2500);
    expect(result.runtime?.plannedOutputTokens).toBe(900);
  });

  it("records actual usage and estimated input accounting in mission runtime", async () => {
    const { runAgentJson } = await import("./run-agent");
    const mission = state();
    const result = await runAgentJson<{ ok: boolean }>({
      state: mission,
      agentName: "architecture",
      role: "worker",
      system: "system",
      user: "Return JSON now.",
      schemaHint: '{"ok":boolean}',
      useSelectedContext: true,
    });

    expect(result.runtime?.inputTokens).toBe(12);
    expect(result.runtime?.outputTokens).toBe(34);
    expect(result.runtime?.estimatedInputTokens).toBeGreaterThan(0);
    expect(result.runtime?.estimatedInputTokens).toBeLessThanOrEqual(2500);
    expect(mission.provider_runtime?.architecture).toEqual(result.runtime);
    expect(mission.provider_matrix?.agents?.architecture).toEqual(result.runtime);
  });

  it("records prompt truncation when focused context is shortened to leave room for system instructions", async () => {
    const { runAgentJson } = await import("./run-agent");
    const mission = state();
    mission.context_pack!.snippets = [
      { path: "src/service.ts", content: "x".repeat(50_000), truncated: false },
    ];
    const result = await runAgentJson<{ ok: boolean }>({
      state: mission,
      agentName: "architecture",
      role: "worker",
      system: "system ".repeat(900),
      user: "Return JSON now.",
      schemaHint: '{"ok":boolean}',
      useSelectedContext: true,
    });

    expect(result.runtime?.promptTruncated).toBe(true);
    expect(result.runtime?.contextTruncated).toBe(true);
  });
});
