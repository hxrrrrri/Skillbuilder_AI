import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  getProviderConfig: vi.fn(),
  refreshProviderModels: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/guards-api", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/guards-api");
  return { ...actual, requireAdminApi: mocks.requireAdminApi };
});

vi.mock("@/lib/providers/registry", () => ({
  getProviderConfig: mocks.getProviderConfig,
}));

vi.mock("@/lib/providers/model-discovery", () => ({
  refreshProviderModels: mocks.refreshProviderModels,
}));

vi.mock("@/lib/auth/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

describe("/api/admin/providers/[providerId]/models/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminApi.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mocks.getProviderConfig.mockResolvedValue({ providerId: "codex_cli" });
    mocks.refreshProviderModels.mockResolvedValue({
      providerId: "codex_cli",
      options: [
        { value: "live-model", source: "live" },
        { value: "custom-model", source: "custom" },
      ],
      status: "live",
      discoveredAt: "2026-05-31T00:00:00.000Z",
      error: null,
      customModels: ["custom-model"],
    });
  });

  it("refreshes live models and writes status metadata", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://test.local/api/admin/providers/codex_cli/models/refresh", {
        method: "POST",
        headers: { "user-agent": "vitest" },
      }),
      { params: { providerId: "codex_cli" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("live");
    expect(mocks.refreshProviderModels).toHaveBeenCalledWith("codex_cli");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.provider.refresh_models",
        actorUserId: "admin-1",
        targetType: "provider",
        targetId: "codex_cli",
        metadata: { status: "live", count: 2 },
      }),
    );
  });
});
