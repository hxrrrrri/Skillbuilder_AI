import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("anthropic provider reasoning budget", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV, ANTHROPIC_API_KEY: "test-key" };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it("passes max reasoning budget as an Anthropic thinking block", async () => {
    const create = vi.fn(async () => ({
      content: [{ type: "text", text: '{"ok":true}' }],
      usage: { input_tokens: 10, output_tokens: 4 },
    }));
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: { create },
      })),
    }));

    const { makeAnthropicApiProvider } = await import("./anthropic");
    const provider = makeAnthropicApiProvider({ enabled: true });

    const result = await provider.runJson(
      {
        system: "system",
        user: "user",
        model: "claude-opus-test",
        reasoningBudget: "max",
        maxTokens: 40_000,
      },
      '{"ok":boolean}',
    );

    expect(result.json).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-opus-test",
        thinking: { type: "enabled", budget_tokens: 32768 },
      }),
    );
  });

  it("retries invalid JSON once and then fails closed", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "not json" }],
        usage: { input_tokens: 10, output_tokens: 4 },
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "still not json" }],
        usage: { input_tokens: 8, output_tokens: 3 },
      });
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: { create },
      })),
    }));

    const { makeAnthropicApiProvider } = await import("./anthropic");
    const provider = makeAnthropicApiProvider({ enabled: true });

    await expect(provider.runJson({ system: "system", user: "user" }, '{"ok":boolean}')).rejects.toMatchObject({
      code: "provider_invalid_json",
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("classifies authentication failure", async () => {
    const create = vi.fn(async () => {
      const err: any = new Error("invalid api key");
      err.status = 401;
      throw err;
    });
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: { create },
      })),
    }));

    const { makeAnthropicApiProvider } = await import("./anthropic");
    const provider = makeAnthropicApiProvider({ enabled: true });

    await expect(provider.runJson({ system: "system", user: "user" }, '{"ok":boolean}')).rejects.toMatchObject({
      code: "provider_not_authenticated",
    });
  });
});
