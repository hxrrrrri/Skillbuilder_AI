import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  writeAuditLog: vi.fn(),
  verifyPassword: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    publicProfile: { updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/session");
  return { ...actual, getCurrentUser: mocks.getCurrentUser };
});
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/auth/password", () => ({ verifyPassword: mocks.verifyPassword, hashPassword: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function req(body: any): Request {
  return new Request("http://test.local/api/candidate/delete-account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/candidate/delete-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "candidate", tenantIds: [] });
    mocks.prisma.user.findUnique.mockResolvedValue({ passwordHash: "hash", email: "u1@x.com" });
    mocks.prisma.publicProfile.updateMany.mockResolvedValue({ count: 0 });
  });

  it("rejects without DELETE confirm token", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ password: "x", confirm: "yes" }));
    expect(res.status).toBe(400);
  });

  it("rejects when password is wrong", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    const { POST } = await import("./route");
    const res = await POST(req({ password: "bad", confirm: "DELETE" }));
    expect(res.status).toBe(403);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("soft-deletes, hides profiles, and writes user.deleted audit", async () => {
    mocks.verifyPassword.mockResolvedValue(true);
    const { POST } = await import("./route");
    const res = await POST(req({ password: "right", confirm: "DELETE" }));
    expect(res.status).toBe(200);
    expect(mocks.prisma.publicProfile.updateMany).toHaveBeenCalledWith({
      where: { ownerUserId: "u1" },
      data: { visibility: "private" },
    });
    const updateCall = mocks.prisma.user.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("deleted");
    expect(updateCall.data.name).toBe("Deleted user");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.deleted", targetType: "user", targetId: "u1" }),
    );
  });
});
