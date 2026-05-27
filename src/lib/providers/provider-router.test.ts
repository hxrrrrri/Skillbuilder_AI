import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderId, ProviderMatrix, ProviderMatrixAgentEntry } from "./types";

type ProviderMock = {
  id: ProviderId;
  label: string;
  available: ReturnType<typeof vi.fn>;
  runJson: ReturnType<typeof vi.fn>;
};

const baseConfig = {
  providers: {
    claude_cli: { command: "claude", args: ["-p", "{{prompt}}"], enabled: true },
    codex_cli: { command: "codex", args: ["exec", "{{prompt}}"], enabled: true },
    ollama: { model: "llama3.1:8b", baseUrl: "http://localhost:11434", enabled: true },
    copilot_cli: { command: "gh", args: ["copilot", "suggest", "{{prompt}}"], enabled: false },
  },
  roles: {
    orchestrator: ["mock"],
    worker: ["ollama", "mock"],
    validator: ["mock"],
    interview: ["mock"],
    profile: ["mock"],
  },
};

function entry(patch: Partial<ProviderMatrixAgentEntry> = {}): ProviderMatrixAgentEntry {
  return {
    provider: "anthropic_api",
    model: "claude-test",
    reasoningBudget: "medium",
    enabled: true,
    fallbackProvider: "mock",
    fallbackModel: null,
    fallbackStrategy: "mock",
    temperature: 0.2,
    maxTokens: 1500,
    jsonMode: true,
    timeoutMs: 60_000,
    retryCount: 1,
    source: "db",
    status: "planned",
    ...patch,
  };
}

function resolved(patch: Partial<ProviderMatrixAgentEntry> = {}) {
  return {
    agentName: "architecture",
    costTier: "medium",
    qualityTier: "medium",
    ...entry(patch),
  };
}

function makeProvider(
  id: ProviderId,
  options: {
    available?: boolean;
    results?: Array<any | Error | ((prompt: any) => any)>;
  } = {},
): ProviderMock {
  const results = [...(options.results ?? [])];
  return {
    id,
    label: id,
    available: vi.fn(async () => options.available ?? true),
    runJson: vi.fn(async (prompt: any) => {
      const next = results.length ? results.shift() : undefined;
      if (next instanceof Error) throw next;
      if (typeof next === "function") return next(prompt);
      return (
        next ?? {
          json: id === "mock" ? { mock: true } : { ok: true },
          raw: id === "mock" ? '{"mock":true}' : '{"ok":true}',
          provider: id,
          inputTokens: 3,
          outputTokens: 2,
          model: prompt.model ?? `${id}:model`,
        }
      );
    }),
  };
}

async function loadRouter(opts: {
  agentConfig?: any;
  config?: any;
  providers?: Partial<Record<ProviderId, ProviderMock>>;
  providerRows?: any[];
} = {}) {
  vi.resetModules();
  const providers: Record<ProviderId, ProviderMock> = {
    anthropic_api: makeProvider("anthropic_api"),
    claude_cli: makeProvider("claude_cli"),
    codex_cli: makeProvider("codex_cli"),
    ollama: makeProvider("ollama"),
    copilot_cli: makeProvider("copilot_cli", { available: false }),
    mock: makeProvider("mock"),
    ...(opts.providers as any),
  };

  vi.doMock("@/lib/db", () => ({ prisma: {} }));
  vi.doMock("./config", () => ({
    loadProviderConfig: vi.fn(() => opts.config ?? baseConfig),
  }));
  vi.doMock("./registry", () => ({
    AGENT_NAMES: ["architecture"],
    listProviderConfigs: vi.fn(async () => opts.providerRows ?? []),
    resolveAgentConfig: vi.fn(async () => opts.agentConfig ?? resolved({ source: "default" })),
  }));
  vi.doMock("./anthropic", () => ({
    makeAnthropicApiProvider: vi.fn(() => providers.anthropic_api),
  }));
  vi.doMock("./cli-provider", () => ({
    makeCliProvider: vi.fn((factoryOpts: { id: ProviderId }) => providers[factoryOpts.id]),
  }));
  vi.doMock("./ollama", () => ({
    makeOllamaProvider: vi.fn(() => providers.ollama),
  }));
  vi.doMock("./mock", () => ({
    mockProvider: providers.mock,
  }));

  const router = await import("./provider-router");
  return { router, providers };
}

function matrix(agentEntry: ProviderMatrixAgentEntry): ProviderMatrix {
  return {
    orchestrator: "mock",
    worker: agentEntry.provider,
    validator: "mock",
    interview: "mock",
    profile: "mock",
    agents: { architecture: agentEntry },
  };
}

describe("provider-router runtime resolution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses DB AgentConfig before file preferences", async () => {
    const { router } = await loadRouter({
      agentConfig: resolved({
        source: "db",
        provider: "anthropic_api",
        model: "db-model",
        reasoningBudget: "high",
      }),
      config: {
        ...baseConfig,
        roles: { ...baseConfig.roles, worker: ["ollama", "mock"] },
      },
    });

    const selected = await router.selectProviderMatrix("hybrid");

    expect(selected.agents!.architecture.provider).toBe("anthropic_api");
    expect(selected.agents!.architecture.model).toBe("db-model");
    expect(selected.agents!.architecture.reasoningBudget).toBe("high");
    expect(selected.agents!.architecture.source).toBe("db");
  });

  it("falls back to file preferences when DB config is absent", async () => {
    const { router } = await loadRouter({
      agentConfig: resolved({ source: "default", provider: "anthropic_api" }),
      config: {
        ...baseConfig,
        roles: { ...baseConfig.roles, worker: ["ollama", "mock"] },
      },
    });

    const selected = await router.selectProviderMatrix("hybrid");

    expect(selected.agents!.architecture.provider).toBe("ollama");
    expect(selected.agents!.architecture.source).toBe("file");
  });

  it("falls back to mock when DB is absent and file providers are unavailable", async () => {
    const { router } = await loadRouter({
      agentConfig: resolved({ source: "default", provider: "anthropic_api" }),
      providers: {
        ollama: makeProvider("ollama", { available: false }),
      },
      config: {
        ...baseConfig,
        roles: { ...baseConfig.roles, worker: ["ollama"] },
      },
    });

    const selected = await router.selectProviderMatrix("hybrid");

    expect(selected.agents!.architecture.provider).toBe("mock");
    expect(selected.agents!.architecture.source).toBe("mock");
  });

  it("passes resolved model and reasoning budget into provider calls", async () => {
    let seenPrompt: any = null;
    const anthropic = makeProvider("anthropic_api", {
      results: [
        (prompt: any) => {
          seenPrompt = prompt;
          return {
            json: { ok: true },
            raw: '{"ok":true}',
            provider: "anthropic_api",
            inputTokens: 5,
            outputTokens: 3,
            model: prompt.model,
          };
        },
      ],
    });
    const { router } = await loadRouter({ providers: { anthropic_api: anthropic } });
    const agentEntry = entry({ model: "claude-opus-test", reasoningBudget: "max" });

    const result = await router.runWithMatrix(
      matrix(agentEntry),
      "worker",
      { system: "sys", user: "user" },
      '{"ok":boolean}',
      "architecture",
    );

    expect(result.provider).toBe("anthropic_api");
    expect(seenPrompt.model).toBe("claude-opus-test");
    expect(seenPrompt.reasoningBudget).toBe("max");
    expect(result.runtime?.reasoningBudget).toBe("max");
  });
});

describe("provider-router fallback strategies", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fallbackStrategy=mock returns the mock provider on invalid JSON", async () => {
    const { router } = await loadRouter({
      providers: {
        anthropic_api: makeProvider("anthropic_api", {
          results: [
            {
              json: null,
              raw: "not json",
              provider: "anthropic_api",
              inputTokens: 5,
              outputTokens: 3,
              model: "bad-model",
            },
          ],
        }),
      },
    });
    const agentEntry = entry({ fallbackStrategy: "mock" });

    const result = await router.runWithMatrix(
      matrix(agentEntry),
      "worker",
      { system: "sys", user: "user" },
      '{"ok":boolean}',
      "architecture",
    );

    expect(result.provider).toBe("mock");
    expect(result.runtime?.status).toBe("fallback");
    expect(result.runtime?.note).toContain("invalid JSON");
  });

  it("fallbackStrategy=retry reruns the same provider once", async () => {
    const anthropic = makeProvider("anthropic_api", {
      results: [
        new Error("temporary outage"),
        {
          json: { ok: true },
          raw: '{"ok":true}',
          provider: "anthropic_api",
          inputTokens: 5,
          outputTokens: 3,
          model: "retry-model",
        },
      ],
    });
    const { router, providers } = await loadRouter({ providers: { anthropic_api: anthropic } });
    const agentEntry = entry({ fallbackStrategy: "retry" });

    const result = await router.runWithMatrix(
      matrix(agentEntry),
      "worker",
      { system: "sys", user: "user" },
      '{"ok":boolean}',
      "architecture",
    );

    expect(result.provider).toBe("anthropic_api");
    expect(providers.anthropic_api.runJson).toHaveBeenCalledTimes(2);
    expect(result.runtime?.note).toBe("retry after provider failure");
  });

  it("fallbackStrategy=skip throws AgentSkippedError", async () => {
    const { router } = await loadRouter({
      providers: {
        anthropic_api: makeProvider("anthropic_api", {
          results: [
            {
              json: null,
              raw: "not json",
              provider: "anthropic_api",
              inputTokens: 5,
              outputTokens: 3,
              model: "bad-model",
            },
          ],
        }),
      },
    });
    const agentEntry = entry({ fallbackStrategy: "skip" });

    await expect(
      router.runWithMatrix(
        matrix(agentEntry),
        "worker",
        { system: "sys", user: "user" },
        '{"ok":boolean}',
        "architecture",
      ),
    ).rejects.toBeInstanceOf(router.AgentSkippedError);
  });
});
