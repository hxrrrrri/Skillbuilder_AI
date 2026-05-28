import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const ORIGINAL_FETCH = global.fetch;

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Ollama provider", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("reports server down", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as any;
    const { detectOllama } = await import("./ollama");
    await expect(detectOllama({ baseUrl: "http://localhost:11434", model: "qwen2.5-coder" })).resolves.toMatchObject({
      status: "failed",
      installed: false,
      lastError: "ECONNREFUSED",
    });
  });

  it("reports configured model missing", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ models: [{ name: "llama3.1:8b" }] })) as any;
    const { detectOllama } = await import("./ollama");
    await expect(detectOllama({ baseUrl: "http://localhost:11434", model: "qwen2.5-coder" })).resolves.toMatchObject({
      status: "failed",
      installed: true,
      lastError: "configured model 'qwen2.5-coder' is not installed",
    });
  });

  it("fails closed when runJson cannot get valid JSON after repair", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: "qwen2.5-coder" }] }))
      .mockResolvedValueOnce(jsonResponse({ response: "not json" }))
      .mockResolvedValueOnce(jsonResponse({ response: "still not json" }));
    global.fetch = fetchMock as any;

    const { makeOllamaProvider } = await import("./ollama");
    const provider = makeOllamaProvider({ baseUrl: "http://localhost:11434", model: "qwen2.5-coder" });
    await expect(provider.runJson({ system: "s", user: "u" }, '{"ok":boolean}')).rejects.toMatchObject({
      code: "provider_invalid_json",
    });
  });

  it("fails closed when configured model disappears before execution", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ models: [{ name: "llama3.1:8b" }] })) as any;
    const { makeOllamaProvider } = await import("./ollama");
    const provider = makeOllamaProvider({ baseUrl: "http://localhost:11434", model: "qwen2.5-coder" });
    await expect(provider.runJson({ system: "s", user: "u" }, '{"ok":boolean}')).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });

  it("returns parsed JSON on success", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: "qwen2.5-coder" }] }))
      .mockResolvedValueOnce(jsonResponse({ response: '{"ok":true}', prompt_eval_count: 3, eval_count: 2 }));
    global.fetch = fetchMock as any;

    const { makeOllamaProvider } = await import("./ollama");
    const provider = makeOllamaProvider({ baseUrl: "http://localhost:11434", model: "qwen2.5-coder" });
    await expect(provider.runJson({ system: "s", user: "u" }, '{"ok":boolean}')).resolves.toMatchObject({
      json: { ok: true },
      provider: "ollama",
    });
  });
});
