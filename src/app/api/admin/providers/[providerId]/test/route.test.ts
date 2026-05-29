import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  buildProviderRegistry: vi.fn(),
  getProviderConfig: vi.fn(),
  recordProviderTest: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/guards-api", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/guards-api");
  return {
    ...actual,
    requireAdminApi: mocks.requireAdminApi,
  };
});

vi.mock("@/lib/providers/provider-router", () => ({
  buildProviderRegistry: mocks.buildProviderRegistry,
}));

vi.mock("@/lib/providers/registry", () => ({
  getProviderConfig: mocks.getProviderConfig,
  recordProviderTest: mocks.recordProviderTest,
}));

vi.mock("@/lib/auth/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

describe("/api/admin/providers/[providerId]/test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminApi.mockResolvedValue({
      user: {
        id: "admin-1",
        role: "admin",
      },
    });
    mocks.getProviderConfig.mockResolvedValue({ providerId: "anthropic_api" });
    mocks.writeAuditLog.mockResolvedValue(undefined);
  });

  it("does not return HTTP 500 when provider test persistence fails", async () => {
    mocks.buildProviderRegistry.mockResolvedValue({
      anthropic_api: {
        available: vi.fn(async () => false),
        health: vi.fn(async () => ({
          status: "failed",
          lastError: "ANTHROPIC_API_KEY missing",
          fix: "Set ANTHROPIC_API_KEY",
        })),
      },
    });
    mocks.recordProviderTest.mockRejectedValue(new Error("db write failed"));

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://test.local/api/admin/providers/anthropic_api/test", { method: "POST" }),
      { params: { providerId: "anthropic_api" } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider_id).toBe("anthropic_api");
    expect(body.available).toBe(false);
  });
});
