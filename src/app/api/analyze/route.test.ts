import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueOwnershipChallengeToken } from "@/lib/ownership-challenge";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  checkProviderReadinessForMode: vi.fn(),
  runMission: vi.fn(),
  preCreateEvents: vi.fn(),
  createSnapshotIfReVerify: vi.fn(),
  writeAuditLog: vi.fn(),
  prisma: {
    candidate: { upsert: vi.fn(), create: vi.fn() },
    repository: { create: vi.fn() },
    analysisRun: { create: vi.fn(), update: vi.fn() },
    ownershipChallenge: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/session");
  return { ...actual, getCurrentUser: mocks.getCurrentUser };
});

vi.mock("@/lib/providers/provider-router", () => ({
  checkProviderReadinessForMode: mocks.checkProviderReadinessForMode,
}));

vi.mock("@/agents/mission-runner", () => ({
  runMission: mocks.runMission,
  preCreateEvents: mocks.preCreateEvents,
}));

vi.mock("@/lib/reverification", () => ({
  createSnapshotIfReVerify: mocks.createSnapshotIfReVerify,
}));

vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function makeReq(body: any): Request {
  return new Request("http://test.local/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseBody = {
  repo_url: "https://github.com/octo/demo",
  candidate_name: "Test Candidate",
  github_username: "octo",
  target_role: "Full-stack Developer",
  candidate_level: "Junior",
  execution_mode: "api",
  local_install_approved: false,
};

const originalEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "candidate", email: "c@test.dev", primaryTenantId: null });
  mocks.checkProviderReadinessForMode.mockResolvedValue({ ok: true, mode: "api", matrix: { agents: {} }, blockers: [] });
  mocks.prisma.candidate.upsert.mockResolvedValue({ id: "c1", userId: "u1", name: "Test Candidate" });
  mocks.prisma.repository.create.mockResolvedValue({ id: "r1" });
  mocks.prisma.analysisRun.create.mockResolvedValue({ id: "run-1" });
  mocks.prisma.analysisRun.update.mockResolvedValue({ id: "run-1" });
  mocks.prisma.ownershipChallenge.findUnique.mockResolvedValue(null);
  mocks.prisma.ownershipChallenge.update.mockResolvedValue({ id: "challenge-1" });
  mocks.preCreateEvents.mockResolvedValue(undefined);
  mocks.createSnapshotIfReVerify.mockResolvedValue(undefined);
  mocks.runMission.mockResolvedValue(undefined);
  mocks.writeAuditLog.mockResolvedValue(undefined);
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
  } else {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }
});

describe("/api/analyze", () => {
  it("blocks when providers are not ready", async () => {
    mocks.checkProviderReadinessForMode.mockResolvedValue({
      ok: false,
      mode: "api",
      matrix: null,
      blockers: [{ providerId: "anthropic_api", reason: "missing auth", fix: "set key" }],
    });
    const { POST } = await import("./route");
    const res = await POST(makeReq(baseBody));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("provider_not_ready");
    expect(mocks.prisma.analysisRun.create).not.toHaveBeenCalled();
  });

  it("rejects expired ownership challenges and marks them expired", async () => {
    const issued = issueOwnershipChallengeToken({
      challengeId: "challenge-1",
      userId: "u1",
      owner: "octo",
      repo: "demo",
    });
    mocks.prisma.ownershipChallenge.findUnique.mockResolvedValue({
      id: "challenge-1",
      userId: "u1",
      repoOwner: "octo",
      repoName: "demo",
      tokenHash: issued.tokenHash,
      expiresAt: new Date(Date.now() - 1000),
      consumedAt: null,
    });

    const { POST } = await import("./route");
    const res = await POST(makeReq({
      ...baseBody,
      ownership_token: issued.token,
      ownership_challenge_id: "challenge-1",
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.reason).toBe("expired");
    expect(mocks.prisma.ownershipChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "expired" } }),
    );
    expect(mocks.prisma.analysisRun.create).not.toHaveBeenCalled();
  });

  it("rejects ownership challenge payload mismatches before creating a run", async () => {
    const issued = issueOwnershipChallengeToken({
      challengeId: "challenge-mismatch",
      userId: "u1",
      owner: "octo",
      repo: "different-repo",
    });

    const { POST } = await import("./route");
    const res = await POST(makeReq({
      ...baseBody,
      ownership_token: issued.token,
      ownership_challenge_id: "challenge-mismatch",
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.reason).toBe("challenge_payload_mismatch");
    expect(mocks.prisma.ownershipChallenge.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.analysisRun.create).not.toHaveBeenCalled();
  });

  it("rejects consumed ownership challenges", async () => {
    const issued = issueOwnershipChallengeToken({
      challengeId: "challenge-2",
      userId: "u1",
      owner: "octo",
      repo: "demo",
    });
    mocks.prisma.ownershipChallenge.findUnique.mockResolvedValue({
      id: "challenge-2",
      userId: "u1",
      repoOwner: "octo",
      repoName: "demo",
      tokenHash: issued.tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
    });

    const { POST } = await import("./route");
    const res = await POST(makeReq({
      ...baseBody,
      ownership_token: issued.token,
      ownership_challenge_id: "challenge-2",
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.reason).toBe("already_consumed");
    expect(mocks.prisma.analysisRun.create).not.toHaveBeenCalled();
  });

  it("links challenges and forwards hashes to the mission runner", async () => {
    const issued = issueOwnershipChallengeToken({
      challengeId: "challenge-3",
      userId: "u1",
      owner: "octo",
      repo: "demo",
    });
    mocks.prisma.ownershipChallenge.findUnique.mockResolvedValue({
      id: "challenge-3",
      userId: "u1",
      repoOwner: "octo",
      repoName: "demo",
      tokenHash: issued.tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    const { POST } = await import("./route");
    const res = await POST(makeReq({
      ...baseBody,
      ownership_token: issued.token,
      ownership_challenge_id: "challenge-3",
    }));
    expect(res.status).toBe(202);
    expect(mocks.prisma.ownershipChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { runId: "run-1", status: "linked" } }),
    );
    expect(mocks.runMission).toHaveBeenCalledWith(
      expect.objectContaining({
        ownershipTokenHash: issued.tokenHash,
        ownershipChallengeId: "challenge-3",
      }),
    );
  });
});
