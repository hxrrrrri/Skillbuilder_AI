import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  writeAuditLog: vi.fn(),
  saveCommandRunAsEvidence: vi.fn(),
  runCommand: vi.fn(),
  prisma: {
    analysisRun: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/session");
  return { ...actual, getCurrentUser: mocks.getCurrentUser };
});
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/local-runner/terminal-store", async () => {
  const actual = await vi.importActual<any>("@/lib/local-runner/terminal-store");
  return { ...actual, saveCommandRunAsEvidence: mocks.saveCommandRunAsEvidence };
});
vi.mock("@/lib/local-runner/terminal", async () => {
  const actual = await vi.importActual<any>("@/lib/local-runner/terminal");
  return { ...actual, runCommand: mocks.runCommand };
});

function req(body: any): Request {
  return new Request("http://test.local/api/local/terminal-runs/cmd-1/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/local/terminal-runs/[id]/save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "candidate", primaryTenantId: null });
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({
      id: "r1",
      candidateId: "cand-1",
      createdByUserId: "u1",
      tenantId: null,
      candidate: { userId: "u1" },
    });
    mocks.saveCommandRunAsEvidence.mockResolvedValue({
      commandRunId: "cmd-1",
      command: "git status",
      cwd: ".skillproof/runs/r1",
      exitCode: 0,
      stdoutSummary: "ok",
      stderrSummary: "",
      durationMs: 12,
      usedFor: "git",
      outputSha256: "abc",
    });
  });

  it("requires authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(req({ run_id: "r1" }), { params: { id: "cmd-1" } });
    expect(res.status).toBe(401);
    expect(mocks.saveCommandRunAsEvidence).not.toHaveBeenCalled();
  });

  it("marks an existing command run as evidence without rerunning it", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ run_id: "r1" }), { params: { id: "cmd-1" } });
    expect(res.status).toBe(200);
    expect(mocks.saveCommandRunAsEvidence).toHaveBeenCalledWith({
      commandRunId: "cmd-1",
      runId: "r1",
      actorUserId: "u1",
      isAdmin: false,
    });
    expect(mocks.runCommand).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "terminal.command.saved_as_evidence" }),
    );
  });

  it("blocks non-owners before saving evidence", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u2", role: "candidate", primaryTenantId: null });
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({
      id: "r1",
      candidateId: "cand-1",
      createdByUserId: "u1",
      tenantId: null,
      candidate: { userId: "u1" },
    });
    const { POST } = await import("./route");
    const res = await POST(req({ run_id: "r1" }), { params: { id: "cmd-1" } });
    expect(res.status).toBe(403);
    expect(mocks.saveCommandRunAsEvidence).not.toHaveBeenCalled();
    expect(mocks.runCommand).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "terminal.command.save_denied" }),
    );
  });
});
