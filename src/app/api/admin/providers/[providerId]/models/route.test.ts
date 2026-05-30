import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  getProviderConfig: vi.fn(),
  setCustomModels: vi.fn(),
  getModelOptionsForProvider: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/guards-api", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/guards-api");
  return { ...actual, requireAdminApi: mocks.requireAdminApi };
});

vi.mock("@/lib/providers/registry", () => ({
  getProviderConfig: mocks.getProviderConfig,
  setCustomModels: mocks.setCustomModels,
}));

vi.mock("@/lib/providers/model-discovery", () => ({
  getModelOptionsForProvider: mocks.getModelOptionsForProvider,
}));

vi.mock("@/lib/auth/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

describe("/api/admin/providers/[providerId]/models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminApi.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mocks.getProviderConfig.mockResolvedValue({ providerId: "codex_cli" });
    mocks.getModelOptionsForProvider.mockResolvedValue({
      providerId: "codex_cli",
      options: [{ value: "existing-model", source: "custom" }],
      status: "custom_only",
      discoveredAt: null,
      error: null,
      customModels: ["existing-model"],
    });
  });

  it("adds a custom model and writes an audit record", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://test.local/api/admin/providers/codex_cli/models", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "vitest" },
        body: JSON.stringify({ addModel: "new-model" }),
      }),
      { params: { providerId: "codex_cli" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.setCustomModels).toHaveBeenCalledWith("codex_cli", ["existing-model", "new-model"]);
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.provider.custom_models",
        actorUserId: "admin-1",
        targetType: "provider",
        targetId: "codex_cli",
        metadata: { count: 2 },
      }),
    );
  });

  it("rejects an empty custom model before writing", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://test.local/api/admin/providers/codex_cli/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addModel: "" }),
      }),
      { params: { providerId: "codex_cli" } },
    );

    expect(response.status).toBe(400);
    expect(mocks.setCustomModels).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("rejects a single add when the provider already has 50 custom models", async () => {
    mocks.getModelOptionsForProvider.mockResolvedValue({
      providerId: "codex_cli",
      options: [],
      status: "custom_only",
      discoveredAt: null,
      error: null,
      customModels: Array.from({ length: 50 }, (_, index) => `custom-${index}`),
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://test.local/api/admin/providers/codex_cli/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addModel: "custom-overflow" }),
      }),
      { params: { providerId: "codex_cli" } },
    );

    expect(response.status).toBe(400);
    expect(mocks.setCustomModels).not.toHaveBeenCalled();
  });
});
