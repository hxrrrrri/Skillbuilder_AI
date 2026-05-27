import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  writeAuditLog: vi.fn(),
  prisma: {
    employerShortlist: { findFirst: vi.fn() },
    publicProfile: { findFirst: vi.fn() },
    employerShortlistItem: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/session");
  return {
    ...actual,
    requireRole: mocks.requireRole,
  };
});

vi.mock("@/lib/auth/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma,
}));

describe("POST /api/employer/shortlist/[id]/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      id: "employer-1",
      role: "employer",
      primaryTenantId: "tenant-1",
      tenantIds: ["tenant-1"],
    });
    mocks.prisma.employerShortlist.findFirst.mockResolvedValue({
      id: "shortlist-1",
      ownerUserId: "employer-1",
    });
    mocks.prisma.publicProfile.findFirst.mockResolvedValue({
      id: "profile-1",
      visibility: "public",
    });
    mocks.prisma.employerShortlistItem.upsert.mockResolvedValue({
      id: "item-1",
      shortlistId: "shortlist-1",
      publicProfileId: "profile-1",
    });
  });

  it("uses the unique shortlist/profile key so adding twice is idempotent", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://test.local/api/employer/shortlist/shortlist-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ public_profile_id: "profile-1", note: "priority" }),
    });

    const res = await POST(req, { params: { id: "shortlist-1" } });

    expect(res.status).toBe(201);
    expect(mocks.prisma.employerShortlistItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shortlistId_publicProfileId: {
            shortlistId: "shortlist-1",
            publicProfileId: "profile-1",
          },
        },
      }),
    );
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "employer.shortlist.item.added",
        actorUserId: "employer-1",
      }),
    );
  });
});
