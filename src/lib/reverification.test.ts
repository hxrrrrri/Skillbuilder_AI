import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    analysisRun: { findUnique: vi.fn(), findFirst: vi.fn() },
    skillScore: { findMany: vi.fn() },
    reVerificationSnapshot: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

describe("reverification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates no snapshot when there is no prior completed run on the same repo URL", async () => {
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({
      id: "r2",
      candidateId: "c1",
      repoId: "rp1",
      repository: { repoUrl: "https://github.com/x/y" },
      candidate: {},
    });
    mocks.prisma.analysisRun.findFirst.mockResolvedValue(null);
    const { createSnapshotIfReVerify } = await import("./reverification");
    const id = await createSnapshotIfReVerify("r2");
    expect(id).toBeNull();
    expect(mocks.prisma.reVerificationSnapshot.create).not.toHaveBeenCalled();
  });

  it("creates a snapshot linking previous + next runs when re-verifying same repo URL", async () => {
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({
      id: "r2",
      candidateId: "c1",
      repoId: "rp2",
      repository: { repoUrl: "https://github.com/x/y" },
      candidate: {},
    });
    mocks.prisma.analysisRun.findFirst.mockResolvedValue({
      id: "r1",
      overallScore: 62,
      repository: { repoUrl: "https://github.com/x/y" },
    });
    mocks.prisma.reVerificationSnapshot.create.mockResolvedValue({ id: "s1" });
    const { createSnapshotIfReVerify } = await import("./reverification");
    const id = await createSnapshotIfReVerify("r2");
    expect(id).toBe("s1");
    expect(mocks.prisma.reVerificationSnapshot.create).toHaveBeenCalledWith({
      data: {
        candidateId: "c1",
        repoId: "rp2",
        previousRunId: "r1",
        nextRunId: "r2",
        previousScore: 62,
      },
    });
  });

  it("finalize computes per-skill delta JSON and stores nextScore", async () => {
    mocks.prisma.reVerificationSnapshot.findFirst.mockResolvedValue({
      id: "s1",
      previousRunId: "r1",
      nextRunId: "r2",
    });
    mocks.prisma.skillScore.findMany
      .mockResolvedValueOnce([
        { skillName: "Testing", score: 42 },
        { skillName: "Documentation", score: 50 },
      ])
      .mockResolvedValueOnce([
        { skillName: "Testing", score: 76 },
        { skillName: "Documentation", score: 72 },
      ]);
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({ overallScore: 74 });

    const { finalizeReVerificationForRun } = await import("./reverification");
    await finalizeReVerificationForRun("r2");

    expect(mocks.prisma.reVerificationSnapshot.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: {
        nextScore: 74,
        deltaJson: JSON.stringify({
          Testing: { before: 42, after: 76 },
          Documentation: { before: 50, after: 72 },
        }),
      },
    });
  });

  it("finalize does nothing when nextRun has no overall score yet", async () => {
    mocks.prisma.reVerificationSnapshot.findFirst.mockResolvedValue({
      id: "s1",
      previousRunId: "r1",
      nextRunId: "r2",
    });
    mocks.prisma.skillScore.findMany.mockResolvedValue([]);
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({ overallScore: null });

    const { finalizeReVerificationForRun } = await import("./reverification");
    await finalizeReVerificationForRun("r2");
    expect(mocks.prisma.reVerificationSnapshot.update).not.toHaveBeenCalled();
  });
});
