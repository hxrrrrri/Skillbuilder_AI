import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  writeAuditLog: vi.fn(),
  prisma: {
    analysisRun: { findUnique: vi.fn() },
    agentEvent: { findFirst: vi.fn() },
    skillRun: { findMany: vi.fn() },
    evidenceFinding: { findMany: vi.fn() },
    terminalCommandRun: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/session");
  return { ...actual, getCurrentUser: mocks.getCurrentUser };
});
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function req(): Request {
  return new Request("http://test.local/api/runs/r1/agents/architecture", {
    method: "GET",
    headers: { "user-agent": "vitest" },
  });
}

const params = { id: "r1", agentName: "architecture" };

const accessRow = {
  id: "r1",
  status: "running",
  candidateId: "c1",
  createdByUserId: "owner-1",
  tenantId: "tenant-1",
  candidate: { userId: "owner-1" },
};

const event = {
  id: "e1",
  agentName: "architecture",
  status: "running",
  order: 0,
  startedAt: new Date("2026-01-01T00:00:00.000Z"),
  completedAt: null,
  notes: "in progress",
  output: JSON.stringify({
    completed: ["Checked layering"],
    evidence: [{ file: "src/a.ts", reason: "Layering is clear" }],
    unresolved: ["needs tests"],
    next_recommended: "code-quality",
    runtime: {
      requestedProvider: "anthropic_api",
      actualProvider: "anthropic_api",
      requestedModel: "claude-sonnet-4-6",
      actualModel: "claude-sonnet-4-6",
      reasoningBudget: "medium",
      inputTokens: 10,
      outputTokens: 5,
      promptVersion: "v2",
      note: "ok",
    },
    output: { architecture_score: 80 },
  }),
};

const skillRuns = [
  {
    id: "sr1",
    skillId: "architecture",
    skillVersion: "1",
    agentId: "architecture",
    providerId: "anthropic_api",
    requestedModel: "claude-sonnet-4-6",
    actualModel: "claude-sonnet-4-6",
    status: "completed",
    startedAt: new Date(),
    endedAt: new Date(),
    durationMs: 120,
    inputHash: "abc123",
    outputHash: "def456",
    tokenUsageJson: null,
    costEstimateJson: null,
    fallbackReason: null,
    retryHistoryJson: null,
    promptVersionId: "pv1",
    error: null,
    candidateSummary: "Clean layering",
    employerSummary: "Solid architecture",
    adminTraceJson: JSON.stringify({ internal: "trace" }),
  },
];

const evidence = [
  {
    id: "f1",
    skillRunId: "sr1",
    category: "architecture",
    claim: "Layering clear",
    evidenceType: "code",
    filePath: "src/a.ts",
    lineStart: 1,
    lineEnd: 2,
    commitSha: null,
    confidence: 0.9,
    severity: null,
    candidateSafe: true,
    employerSafe: true,
    adminOnly: false,
    redactedText: "Layering is clear",
    rawTextHash: "h1",
  },
  {
    id: "f2",
    skillRunId: "sr1",
    category: "secret",
    claim: "raw",
    evidenceType: "raw",
    filePath: null,
    lineStart: null,
    lineEnd: null,
    commitSha: null,
    confidence: 0.5,
    severity: "high",
    candidateSafe: false,
    employerSafe: false,
    adminOnly: true,
    redactedText: "ADMIN ONLY DETAIL",
    rawTextHash: "h2",
  },
];

const terminal = [
  {
    id: "t1",
    command: "npm test",
    args: null,
    cwd: "/repo",
    exitCode: 0,
    stdoutSummary: "SECRET STDOUT BODY",
    stderrSummary: "SECRET STDERR BODY",
    durationMs: 50,
    outputHash: "oh1",
    usedFor: "testing",
    ranAt: new Date(),
    savedAsEvidence: true,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeAuditLog.mockResolvedValue(undefined);
  mocks.prisma.analysisRun.findUnique.mockResolvedValue(accessRow);
  mocks.prisma.agentEvent.findFirst.mockResolvedValue(event);
  mocks.prisma.skillRun.findMany.mockResolvedValue(skillRuns);
  mocks.prisma.evidenceFinding.findMany.mockResolvedValue(evidence);
  mocks.prisma.terminalCommandRun.findMany.mockResolvedValue(terminal);
});

describe("GET /api/runs/[id]/agents/[agentName]", () => {
  it("rejects non-authenticated requests with 401", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(req(), { params });
    expect(res.status).toBe(401);
  });

  it("gives the run owner a redacted candidate-safe view", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "owner-1", role: "candidate", tenantIds: [] });
    const { GET } = await import("./route");
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mode).toBe("candidate");
    expect(data.status).toBe("running");
    expect(data.checks).toMatch(/architecture/i);
    // candidate-safe evidence only (no admin-only finding)
    expect(data.safe_evidence).toHaveLength(1);
    expect(data.safe_evidence[0].redacted_text).toBe("Layering is clear");
    // admin-only surfaces must be absent
    expect(data.runtime).toBeUndefined();
    expect(data.skill_runs).toBeUndefined();
    expect(data.evidence_findings).toBeUndefined();
    expect(data.handoff).toBeUndefined();
    // no secret/admin/terminal data leaks
    const raw = JSON.stringify(data);
    expect(raw).not.toContain("ADMIN ONLY DETAIL");
    expect(raw).not.toContain("SECRET STDOUT");
    expect(raw).not.toContain("trace");
  });

  it("forbids a candidate from inspecting another user's run", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "intruder", role: "candidate", tenantIds: [] });
    const { GET } = await import("./route");
    const res = await GET(req(), { params });
    expect(res.status).toBe(403);
  });

  it("gives admins the full admin-safe view including provenance", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin", tenantIds: [] });
    const { GET } = await import("./route");
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mode).toBe("admin");
    expect(data.status).toBe("running");
    expect(data.runtime.actual_provider).toBe("anthropic_api");
    expect(data.runtime.prompt_version).toBe("v2");
    expect(data.skill_runs).toHaveLength(1);
    expect(data.evidence_findings).toHaveLength(2); // includes admin-only
    expect(data.parsed_output).toMatchObject({ architecture_score: 80 });
    expect(data.handoff).toBeTruthy();
    expect(data.admin_traces.length).toBe(1);
  });

  it("never exposes raw terminal stdout/stderr, even to admins", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin", tenantIds: [] });
    const { GET } = await import("./route");
    const res = await GET(req(), { params });
    const data = await res.json();
    expect(data.terminal_runs).toHaveLength(1);
    expect(data.terminal_runs[0].command).toBe("npm test");
    const raw = JSON.stringify(data);
    expect(raw).not.toContain("SECRET STDOUT BODY");
    expect(raw).not.toContain("SECRET STDERR BODY");
  });

  it("returns 404 for an authenticated user when the run does not exist", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin", tenantIds: [] });
    mocks.prisma.analysisRun.findUnique.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(req(), { params });
    expect(res.status).toBe(404);
  });
});
