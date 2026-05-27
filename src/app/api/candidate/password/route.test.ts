import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  writeAuditLog: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/session");
  return { ...actual, getCurrentUser: mocks.getCurrentUser };
});
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function req(body: any): Request {
  return new Request("http://test.local/api/candidate/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/candidate/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "candidate", tenantIds: [] });
    mocks.prisma.user.findUnique.mockResolvedValue({ passwordHash: "old-hash" });
    mocks.hashPassword.mockResolvedValue("new-hash");
  });

  it("rejects when current password is wrong and writes a failure audit", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    const { POST } = await import("./route");
    const res = await POST(req({ current_password: "bad", new_password: "new-strong-pw" }));
    expect(res.status).toBe(403);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "candidate.password.failed" }),
    );
  });

  it("updates the hash and audits success when current password matches", async () => {
    mocks.verifyPassword.mockResolvedValue(true);
    const { POST } = await import("./route");
    const res = await POST(req({ current_password: "old", new_password: "new-strong-pw" }));
    expect(res.status).toBe(200);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "new-hash" },
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "candidate.password.changed" }),
    );
  });

  it("rejects new password under 8 chars", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ current_password: "old", new_password: "short" }));
    expect(res.status).toBe(400);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });
});
