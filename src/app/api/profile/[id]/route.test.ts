import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  writeAuditLog: vi.fn(),
  prisma: {
    publicProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/session");
  return { ...actual, getCurrentUser: mocks.getCurrentUser };
});
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

const profileOwnedByU1 = {
  id: "p1",
  slug: "alice-repo",
  ownerUserId: "u1",
  visibility: "public",
  includeTerminalProof: false,
  run: { tenantId: null },
};

function patchReq(body: any): Request {
  return new Request("http://test.local/api/profile/p1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/profile/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.publicProfile.update.mockResolvedValue({
      id: "p1",
      visibility: "unlisted",
      includeTerminalProof: false,
    });
  });

  it("PATCH refuses non-owner non-admin users", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "intruder", role: "candidate", tenantIds: [] });
    mocks.prisma.publicProfile.findUnique.mockResolvedValue(profileOwnedByU1);
    const { PATCH } = await import("./route");
    const res = await PATCH(patchReq({ visibility: "private" }), { params: { id: "p1" } });
    expect(res.status).toBe(403);
    expect(mocks.prisma.publicProfile.update).not.toHaveBeenCalled();
  });

  it("PATCH allows owner to flip visibility and audits the change", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "candidate", tenantIds: [] });
    mocks.prisma.publicProfile.findUnique.mockResolvedValue(profileOwnedByU1);
    const { PATCH } = await import("./route");
    const res = await PATCH(patchReq({ visibility: "unlisted" }), { params: { id: "p1" } });
    expect(res.status).toBe(200);
    expect(mocks.prisma.publicProfile.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { visibility: "unlisted" },
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "profile.update" }),
    );
  });

  it("DELETE refuses non-owner", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "intruder", role: "candidate", tenantIds: [] });
    mocks.prisma.publicProfile.findUnique.mockResolvedValue(profileOwnedByU1);
    const { DELETE } = await import("./route");
    const res = await DELETE(new Request("http://test.local/api/profile/p1", { method: "DELETE" }), {
      params: { id: "p1" },
    });
    expect(res.status).toBe(403);
    expect(mocks.prisma.publicProfile.delete).not.toHaveBeenCalled();
  });

  it("DELETE removes the row and audits profile.unpublish", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "candidate", tenantIds: [] });
    mocks.prisma.publicProfile.findUnique.mockResolvedValue(profileOwnedByU1);
    mocks.prisma.publicProfile.delete.mockResolvedValue({});
    const { DELETE } = await import("./route");
    const res = await DELETE(new Request("http://test.local/api/profile/p1", { method: "DELETE" }), {
      params: { id: "p1" },
    });
    expect(res.status).toBe(200);
    expect(mocks.prisma.publicProfile.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "profile.unpublish" }),
    );
  });
});
