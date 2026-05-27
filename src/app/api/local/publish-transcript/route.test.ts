import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  writeAuditLog: vi.fn(),
  prisma: {
    analysisRun: { findUnique: vi.fn() },
    publicProfile: { updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/session");
  return { ...actual, getCurrentUser: mocks.getCurrentUser };
});
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function makeReq(body: any): Request {
  return new Request("http://test.local/api/local/publish-transcript", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/local/publish-transcript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.publicProfile.updateMany.mockResolvedValue({ count: 1 });
  });

  it("requires authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeReq({ run_id: "r1", include: true }));
    expect(res.status).toBe(401);
    expect(mocks.prisma.publicProfile.updateMany).not.toHaveBeenCalled();
  });

  it("rejects when caller is not the run owner", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "intruder", role: "candidate", tenantIds: [] });
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({
      id: "r1",
      tenantId: null,
      createdByUserId: "owner-1",
      candidate: null,
    });
    const { POST } = await import("./route");
    const res = await POST(makeReq({ run_id: "r1", include: true }));
    expect(res.status).toBe(403);
    expect(mocks.prisma.publicProfile.updateMany).not.toHaveBeenCalled();
  });

  it("updates owner's profiles and audits the change", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "candidate", tenantIds: [] });
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({
      id: "r1",
      tenantId: null,
      createdByUserId: "u1",
      candidate: null,
    });
    const { POST } = await import("./route");
    const res = await POST(makeReq({ run_id: "r1", include: true }));
    expect(res.status).toBe(200);
    expect(mocks.prisma.publicProfile.updateMany).toHaveBeenCalledWith({
      where: { runId: "r1", ownerUserId: "u1" },
      data: { includeTerminalProof: true },
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "terminal.publish_transcript",
        metadata: expect.objectContaining({ include: true }),
      }),
    );
  });
});
