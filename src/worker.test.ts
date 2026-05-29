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
      attemptCount: 0,
      targetRole: "Full-stack Developer",
      candidateLevel: "Junior",
      maxAttempts: 3,
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

  it("claims pending runs with worker metadata and in_progress state", async () => {
    const { claimNextRun } = await import("./worker");
    const claimed = await claimNextRun("worker-test-1");

    expect(claimed?.id).toBe("run-1");
    expect(mocks.prisma.analysisRun.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "run-1", status: "pending" }),
      data: expect.objectContaining({
        status: "in_progress",
        workerId: "worker-test-1",
        attemptCount: { increment: 1 },
        statusMessage: "Claimed by worker worker-test-1.",
      }),
    });
  });

  it("retries failed runs until max attempts with clear worker failure metadata", async () => {
    mocks.runMission.mockRejectedValueOnce(new Error("provider failed"));
    const { processOne } = await import("./worker");

    await expect(processOne("worker-test-2")).resolves.toBe(true);
    expect(mocks.prisma.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: "pending",
        statusMessage: "Worker worker-test-2 failed attempt 1/3; queued for retry.",
        lastFailureReason: "provider failed",
        workerId: "worker-test-2",
      }),
    });
  });

  it("marks the run failed when the max attempt is reached", async () => {
    mocks.prisma.analysisRun.findFirst.mockResolvedValueOnce({
      id: "run-1",
      attemptCount: 2,
      maxAttempts: 3,
      targetRole: "Full-stack Developer",
      candidateLevel: "Junior",
      jobDescription: null,
      executionMode: "hybrid",
      localInstallApproved: false,
      repository: { owner: "octo", repoName: "demo", repoUrl: "https://github.com/octo/demo" },
      candidate: { name: "Test Candidate", githubUsername: "octo" },
    });
    mocks.runMission.mockRejectedValueOnce(new Error("provider failed"));
    const { processOne } = await import("./worker");

    await expect(processOne("worker-test-3")).resolves.toBe(true);
    expect(mocks.prisma.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: "failed",
        statusMessage: "provider failed",
        lastFailureReason: "provider failed",
        workerId: "worker-test-3",
      }),
    });
  });
});
