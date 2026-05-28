import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    analysisRun: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    ownershipChallenge: {
      findFirst: vi.fn(),
    },
  },
  runMission: vi.fn(),
}));

vi.mock("./lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("./agents/mission-runner", () => ({ runMission: mocks.runMission }));

describe("worker ownership challenge handoff", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    mocks.prisma.analysisRun.findFirst.mockResolvedValue({
      id: "run-1",
      targetRole: "Full-stack Developer",
      candidateLevel: "Junior",
      jobDescription: null,
      executionMode: "hybrid",
      localInstallApproved: false,
      repository: { owner: "octo", repoName: "demo", repoUrl: "https://github.com/octo/demo" },
      candidate: { name: "Test Candidate", githubUsername: "octo" },
    });
    mocks.prisma.analysisRun.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.ownershipChallenge.findFirst.mockResolvedValue({ id: "challenge-1", tokenHash: "hash-1" });
    mocks.runMission.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    } else {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
    }
  });

  it("passes ownership challenge fields to runMission", async () => {
    const { processOne } = await import("./worker");
    const worked = await processOne();
    expect(worked).toBe(true);
    expect(mocks.runMission).toHaveBeenCalledWith(
      expect.objectContaining({
        ownershipTokenHash: "hash-1",
        ownershipChallengeId: "challenge-1",
      }),
    );
  });
});
