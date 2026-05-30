import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const saveDiscoveredModels = vi.fn();
const probe = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { providerConfig: { findUnique } },
}));

vi.mock("./registry", () => ({
  saveDiscoveredModels,
}));

vi.mock("./cli-utils", () => ({
  probe,
  combinedOutput: (run: { stdout?: string; stderr?: string }) => [run.stdout, run.stderr].filter(Boolean).join("\n"),
  parseModelList: (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
}));

describe("refreshProviderModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({
      providerId: "codex_cli",
      discoveredModelsJson: '["cached-model"]',
      customModelsJson: '["custom-model"]',
      modelsDiscoveredAt: null,
    });
    probe.mockResolvedValue({
      exitCode: 0,
      stdout: '["live-model"]',
      stderr: "",
    });
  });

  it("returns live options even when best-effort cache persistence fails", async () => {
    saveDiscoveredModels.mockRejectedValue(new Error("db locked"));
    const { refreshProviderModels } = await import("./model-discovery");

    const result = await refreshProviderModels("codex_cli");

    expect(result.status).toBe("live");
    expect(result.options).toEqual([
      { value: "live-model", source: "live" },
      { value: "custom-model", source: "custom" },
    ]);
  });
});
