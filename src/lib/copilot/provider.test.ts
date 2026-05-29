import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildProviderRegistry: vi.fn(),
  listProviderConfigs: vi.fn(),
}));

vi.mock("@/lib/providers/provider-router", () => ({
  buildProviderRegistry: mocks.buildProviderRegistry,
}));

vi.mock("@/lib/providers/registry", () => ({
  listProviderConfigs: mocks.listProviderConfigs,
}));

import { CopilotProviderNotReadyError, resolveChatProvider } from "./provider";

function provider(available: boolean) {
  return {
    label: "Provider",
    available: vi.fn(async () => available),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildProviderRegistry.mockResolvedValue({
    anthropic_api: provider(false),
    claude_cli: provider(true),
    codex_cli: provider(true),
    copilot_cli: provider(true),
    ollama: provider(true),
    deterministic: provider(true),
  });
});

describe("resolveChatProvider", () => {
  it("requires a passing stored provider health test", async () => {
    mocks.listProviderConfigs.mockResolvedValue([
      { providerId: "anthropic_api", enabled: true, lastTestStatus: "ok", lastTestJsonOk: true, defaultModel: "claude-3-5-sonnet-latest" },
      { providerId: "claude_cli", enabled: true, lastTestStatus: null, lastTestJsonOk: null, defaultModel: null },
    ]);

    await expect(resolveChatProvider("claude_cli")).rejects.toBeInstanceOf(CopilotProviderNotReadyError);
  });

  it("does not silently fall back when a requested provider is not ready", async () => {
    mocks.listProviderConfigs.mockResolvedValue([
      { providerId: "anthropic_api", enabled: true, lastTestStatus: "ok", lastTestJsonOk: true, defaultModel: "claude-3-5-sonnet-latest" },
      { providerId: "claude_cli", enabled: true, lastTestStatus: "fail", lastTestJsonOk: false, defaultModel: null },
    ]);

    await expect(resolveChatProvider("claude_cli")).rejects.toMatchObject({ tried: ["claude_cli"] });
  });

  it("auto-selects the first enabled provider with passing health", async () => {
    mocks.listProviderConfigs.mockResolvedValue([
      { providerId: "anthropic_api", enabled: true, lastTestStatus: "fail", lastTestJsonOk: false, defaultModel: "claude-3-5-sonnet-latest" },
      { providerId: "claude_cli", enabled: true, lastTestStatus: "ok", lastTestJsonOk: true, defaultModel: null },
    ]);

    const resolved = await resolveChatProvider();
    expect(resolved.providerId).toBe("claude_cli");
  });
});
