import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  createPromptVersion: vi.fn(),
  listPromptVersions: vi.fn(),
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
    createPromptVersion: mocks.createPromptVersion,
    listPromptVersions: mocks.listPromptVersions,
  };
});

describe("/api/admin/prompts", () => {
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

  it("rejects prompt content over 10000 chars before writing", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://test.local/api/admin/prompts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agent_name: "orchestrator",
        system: "x".repeat(10001),
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mocks.createPromptVersion).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("creates a prompt version and writes audit metadata", async () => {
    mocks.createPromptVersion.mockResolvedValue({
      id: "pv1",
      agentName: "orchestrator",
      version: 2,
      system: "new system",
      instructions: null,
      isActive: true,
    });
    const { POST } = await import("./route");
    const req = new Request("http://test.local/api/admin/prompts", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "vitest" },
      body: JSON.stringify({
        agent_name: "orchestrator",
        system: "new system",
        activate: true,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(mocks.createPromptVersion).toHaveBeenCalledWith({
      agentName: "orchestrator",
      system: "new system",
      instructions: null,
      activate: true,
      createdById: "admin-1",
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.prompt.create",
        actorUserId: "admin-1",
        targetType: "prompt",
        targetId: "pv1",
        metadata: { agent: "orchestrator", version: 2, activated: true },
      }),
    );
  });
});
