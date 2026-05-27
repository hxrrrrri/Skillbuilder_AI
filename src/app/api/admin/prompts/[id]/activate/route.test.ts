import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  activatePromptVersion: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/guards-api", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/guards-api");
  return {
    ...actual,
    requireAdminApi: mocks.requireAdminApi,
  };
});

vi.mock("@/lib/auth/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/lib/providers/registry", async () => {
  const actual = await vi.importActual<any>("@/lib/providers/registry");
  return {
    ...actual,
    activatePromptVersion: mocks.activatePromptVersion,
  };
});

describe("/api/admin/prompts/[id]/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminApi.mockResolvedValue({
      user: {
        id: "admin-1",
        email: "admin@skillproof.dev",
        name: "Admin",
        role: "admin",
        primaryTenantId: null,
        tenantIds: [],
      },
    });
  });

  it("activates a prompt version and writes audit metadata", async () => {
    mocks.activatePromptVersion.mockResolvedValue({
      id: "pv2",
      agentName: "validator",
      version: 2,
      isActive: true,
    });
    const { POST } = await import("./route");
    const req = new Request("http://test.local/api/admin/prompts/pv2/activate", {
      method: "POST",
      headers: { "user-agent": "vitest" },
    });

    const res = await POST(req, { params: { id: "pv2" } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocks.activatePromptVersion).toHaveBeenCalledWith("pv2");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.prompt.activate",
        actorUserId: "admin-1",
        targetType: "prompt",
        targetId: "pv2",
        metadata: { agent: "validator", version: 2 },
      }),
    );
  });
});
