import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    candidate: { findUnique: vi.fn() },
    analysisRun: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

describe("upgradeOwnershipFromOauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("noop when candidate row missing", async () => {
    mocks.prisma.candidate.findUnique.mockResolvedValue(null);
    const { upgradeOwnershipFromOauth } = await import("./oauth-ownership");
    const n = await upgradeOwnershipFromOauth({ userId: "u1", githubLogin: "alice" });
    expect(n).toBe(0);
    expect(mocks.prisma.analysisRun.update).not.toHaveBeenCalled();
  });

  it("upgrades runs whose self-declared gh_user matches", async () => {
    mocks.prisma.candidate.findUnique.mockResolvedValue({ id: "c1" });
    mocks.prisma.analysisRun.findMany.mockResolvedValue([
      {
        id: "r1",
        ownershipStatus: JSON.stringify({ confidence: "self_declared", gh_user: "alice" }),
        repository: { owner: "alice" },
      },
      {
        id: "r2",
        ownershipStatus: JSON.stringify({ confidence: "verified", gh_user: "alice" }),
        repository: { owner: "alice" },
      },
      {
        id: "r3",
        ownershipStatus: JSON.stringify({ confidence: "self_declared", gh_user: "bob" }),
        repository: { owner: "bob" },
      },
    ]);
    const { upgradeOwnershipFromOauth } = await import("./oauth-ownership");
    const n = await upgradeOwnershipFromOauth({ userId: "u1", githubLogin: "Alice" });
    expect(n).toBe(1);
    const call = mocks.prisma.analysisRun.update.mock.calls[0][0];
    expect(call.where.id).toBe("r1");
    const blob = JSON.parse(call.data.ownershipStatus);
    expect(blob.github_oauth_owner_match).toBe(true);
    expect(blob.confidence).toBe("verified");
    expect(blob.verification_method).toBe("github_oauth_owner_match");
  });
});
