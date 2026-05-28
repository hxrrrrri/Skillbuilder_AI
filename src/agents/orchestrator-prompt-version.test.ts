import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionState } from "./types";

const ORIGINAL_ENV = { ...process.env };

function matrixEntry() {
  return {
    provider: "anthropic_api",
    model: "claude-active-test",
    reasoningBudget: "none",
    enabled: true,
    fallbackProvider: null,
    fallbackModel: null,
    fallbackStrategy: "fail",
    temperature: 0.1,
    maxTokens: 2500,
    jsonMode: true,
    timeoutMs: 60_000,
    retryCount: 1,
    source: "db",
    status: "planned",
  } as const;
}

function state(): MissionState {
  return {
    mission_id: "sp_test",
    run_id: "run_test",
    target_role: "Frontend Developer",
    candidate_level: "junior",
    candidate_name: "Test Candidate",
    github_username: "test",
    contract: null,
    context_pack: null,
    scores: [],
    handoffs: [],
    assertion_results: [],
    authenticity: null,
    tokens_in: 0,
    tokens_out: 0,
    mock_mode: false,
    execution_mode: "api",
    provider_matrix: {
      orchestrator: "anthropic_api",
      worker: "anthropic_api",
      validator: "anthropic_api",
      interview: "anthropic_api",
      profile: "anthropic_api",
      agents: { orchestrator: matrixEntry() },
    },
    provider_runtime: {},
    terminal_evidence: [],
    ownership_status: null,
  };
}

describe("orchestrator active prompt version", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV, ANTHROPIC_API_KEY: "test-key" };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses the active PromptVersion system prompt in the Anthropic SDK request", async () => {
    const create = vi.fn(async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            mission_id: "sp_test",
            target_role: "Frontend Developer",
            candidate_level: "junior",
            evaluation_dimensions: ["testing"],
            assertions: [
              {
                id: "A1",
                dimension: "testing",
                statement: "Tests exist.",
                weight: 10,
                detector: "static",
                required_evidence: 1,
              },
            ],
            rubric: { testing: { weight: 10, passingScore: 60 } },
          }),
        },
      ],
      usage: { input_tokens: 20, output_tokens: 10 },
    }));

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: { create },
      })),
    }));
    vi.doMock("@/lib/providers/registry", () => ({
      getActivePrompt: vi.fn(async () => ({
        id: "pv-active",
        agentName: "orchestrator",
        version: 2,
        system: "ACTIVE ORCHESTRATOR PROMPT",
        instructions: "ACTIVE INSTRUCTIONS",
      })),
      AGENT_NAMES: ["orchestrator"],
      listProviderConfigs: vi.fn(async () => [
        {
          providerId: "anthropic_api",
          enabled: true,
          defaultModel: "claude-active-test",
          baseUrl: null,
          command: null,
          argsTemplate: null,
        },
      ]),
      resolveAgentConfig: vi.fn(async () => ({
        agentName: "orchestrator",
        ...matrixEntry(),
        costTier: "high",
        qualityTier: "high",
      })),
    }));

    const { runOrchestrator } = await import("./orchestrator");
    await runOrchestrator(state());

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("ACTIVE ORCHESTRATOR PROMPT"),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("ACTIVE INSTRUCTIONS"),
      }),
    );
    const sdkRequest = (create.mock.calls as any[])[0]?.[0];
    expect(sdkRequest.system).not.toContain("Your single job is to produce a Validation Contract");
  });
});
