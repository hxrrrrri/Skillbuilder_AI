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
    claude_cli: { command: "claude", args: ["--print", "{{prompt}}"], enabled: true },
    codex_cli: { command: "codex", args: ["exec", "--ephemeral", "--skip-git-repo-check", "-"], enabled: true },
    ollama: { model: "llama3.2:latest", baseUrl: "http://localhost:11434", enabled: true },
    copilot_cli: { command: "copilot", args: ["-p", "{{prompt}}", "--silent"], enabled: false },
  },
  roles: {
    orchestrator: ["anthropic_api"],
    worker: ["ollama", "anthropic_api"],
    validator: ["anthropic_api", "codex_cli"],
    interview: ["anthropic_api", "claude_cli"],
    profile: ["anthropic_api"],
  },
};

function entry(patch: Partial<ProviderMatrixAgentEntry> = {}): ProviderMatrixAgentEntry {
  return {
    provider: "anthropic_api",
    model: "claude-test",
    reasoningBudget: "medium",
    enabled: true,
    fallbackProvider: null,
    fallbackModel: null,
    fallbackStrategy: "fail",
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
          json: { ok: true },
          raw: '{"ok":true}',
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
    deterministic: makeProvider("deterministic"),
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
  vi.doMock("./claude-cli", () => ({
    makeClaudeCliProvider: vi.fn(() => providers.claude_cli),
  }));
  vi.doMock("./codex-cli", () => ({
    makeCodexCliProvider: vi.fn(() => providers.codex_cli),
  }));
  vi.doMock("./copilot-cli", () => ({
    makeCopilotCliProvider: vi.fn(() => providers.copilot_cli),
  }));
  vi.doMock("./ollama", () => ({
    makeOllamaProvider: vi.fn(() => providers.ollama),
  }));
  vi.doMock("./deterministic", () => ({
    deterministicProvider: providers.deterministic,
  }));

  const router = await import("./provider-router");
  return { router, providers };
}

function matrix(agentEntry: ProviderMatrixAgentEntry): ProviderMatrix {
  return {
    orchestrator: "anthropic_api",
    worker: agentEntry.provider,
    validator: "anthropic_api",
    interview: "anthropic_api",
    profile: "anthropic_api",
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
    });

    const selected = await router.selectProviderMatrix("hybrid");

    expect(selected.agents!.architecture.provider).toBe("anthropic_api");
    expect(selected.agents!.architecture.model).toBe("db-model");
    expect(selected.agents!.architecture.reasoningBudget).toBe("high");
    expect(selected.agents!.architecture.source).toBe("db");
  });

  it("uses file preferences when DB config is absent", async () => {
    const { router } = await loadRouter({
      agentConfig: resolved({ source: "default", provider: "anthropic_api" }),
    });

    const selected = await router.selectProviderMatrix("hybrid");

    expect(selected.agents!.architecture.provider).toBe("ollama");
    expect(selected.agents!.architecture.source).toBe("file");
  });

  it("fails closed when no real provider is available", async () => {
    const { router } = await loadRouter({
      agentConfig: resolved({ source: "default", provider: "anthropic_api" }),
      providers: {
        anthropic_api: makeProvider("anthropic_api", { available: false }),
        ollama: makeProvider("ollama", { available: false }),
      },
      config: {
        ...baseConfig,
        roles: { ...baseConfig.roles, worker: ["ollama", "anthropic_api"] },
      },
    });

    await expect(router.selectProviderMatrix("hybrid")).rejects.toThrow(/No ready provider/);
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

describe("provider-router fail-closed strategies", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("invalid JSON throws ProviderInvalidJsonError instead of falling back", async () => {
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

    await expect(
      router.runWithMatrix(
        matrix(entry({ fallbackStrategy: "fail" })),
        "worker",
        { system: "sys", user: "user" },
        '{"ok":boolean}',
        "architecture",
      ),
    ).rejects.toBeInstanceOf((await import("./errors")).ProviderInvalidJsonError);
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

    const result = await router.runWithMatrix(
      matrix(entry({ fallbackStrategy: "retry" })),
      "worker",
      { system: "sys", user: "user" },
      '{"ok":boolean}',
      "architecture",
    );

    expect(result.provider).toBe("anthropic_api");
    expect(providers.anthropic_api.runJson).toHaveBeenCalledTimes(2);
    expect(result.runtime?.note).toBe("retry after provider failure");
  });

  it("fallbackStrategy=skip_optional throws AgentSkippedError", async () => {
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

    await expect(
      router.runWithMatrix(
        matrix(entry({ fallbackStrategy: "skip_optional" })),
        "worker",
        { system: "sys", user: "user" },
        '{"ok":boolean}',
        "architecture",
      ),
    ).rejects.toBeInstanceOf(router.AgentSkippedError);
  });
});
