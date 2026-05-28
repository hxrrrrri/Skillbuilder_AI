import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  writeAuditLog: vi.fn(),
  prisma: {
    analysisRun: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/session");
  return { ...actual, getCurrentUser: mocks.getCurrentUser };
});

vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function req(): Request {
  return new Request("http://test.local/api/runs/r1", {
    method: "GET",
    headers: { "user-agent": "vitest" },
  });
}

const accessRow = {
  id: "r1",
  candidateId: "c1",
  createdByUserId: "owner-1",
  tenantId: "tenant-1",
  candidate: { userId: "owner-1" },
};

const fullRun = {
  id: "r1",
  status: "completed",
  statusMessage: null,
  overallScore: 82,
  roleFit: "Good fit",
  verificationLevel: "repo_interview_verified",
  targetRole: "Full-stack developer",
  candidateLevel: "Junior",
  tokenEstimateRaw: 100,
  tokenEstimateUsed: 80,
  validationContract: JSON.stringify({ assertions: [] }),
  contextPack: JSON.stringify({ private: "context" }),
  repoIntelligence: JSON.stringify({ files: [] }),
  validationCoverage: JSON.stringify([]),
  validationSummary: JSON.stringify({ total: 0 }),
  authenticitySignals: null,
  improvementPlan: null,
  employerVerifier: null,
  aiCollaboration: null,
  profileSummary: null,
  executionMode: "api",
  terminalEvidence: JSON.stringify([]),
  providerMatrix: JSON.stringify({ agents: { architecture: { provider: "anthropic_api" } } }),
  ownershipStatus: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  completedAt: new Date("2026-01-01T00:01:00.000Z"),
  candidateId: "c1",
  createdByUserId: "owner-1",
  tenantId: "tenant-1",
  candidate: { id: "c1", name: "Alice", githubUsername: "alice" },
  repository: { repoUrl: "https://github.com/alice/app", repoName: "app", owner: "alice" },
  events: [
    {
      id: "e1",
      agentName: "architecture",
      status: "completed",
      order: 0,
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      completedAt: new Date("2026-01-01T00:00:10.000Z"),
      notes: "ok",
      output: JSON.stringify({
        completed: ["Checked architecture"],
        evidence: [{ file: "src/app.ts", reason: "Layering is clear", source: "github_api" }],
        output: { architecture_score: 82 },
        runtime: { provider: "anthropic_api", model: "claude-sonnet-4-6" },
      }),
    },
  ],
  scores: [
    {
      id: "s1",
      skillName: "Architecture",
      score: 82,
      confidence: 0.8,
      scoreSource: "llm",
      evidence: JSON.stringify([{ file: "src/app.ts", reason: "Layering", source: "github_api" }]),
      validatorNotes: null,
    },
  ],
  questions: [
    {
      id: "q1",
      question: "Explain src/app.ts",
      sourceFile: "src/app.ts",
      lineStart: 1,
      lineEnd: 5,
      expectedSignals: JSON.stringify(["specificity"]),
      redFlags: JSON.stringify(["generic answer"]),
      scoringRubric: JSON.stringify({}),
      answer: "It wires the app.",
      answerScore: 80,
      feedback: "Good",
      dimensionScores: JSON.stringify({ communication: 80 }),
    },
  ],
};

function primeRunLookup() {
  mocks.prisma.analysisRun.findUnique.mockImplementation(async (args: any) => {
    if (args.select) return accessRow;
    return fullRun;
  });
}

describe("/api/runs/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeAuditLog.mockResolvedValue(undefined);
    primeRunLookup();
  });

  it("returns 401 to anonymous callers without loading the full run", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(req(), { params: { id: "r1" } });
    expect(res.status).toBe(401);
    expect(mocks.prisma.analysisRun.findUnique).toHaveBeenCalledTimes(1);
  });

  it("returns 403 to employers and never exposes raw run internals", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "emp-1", role: "employer", tenantIds: ["tenant-1"] });
    const { GET } = await import("./route");
    const res = await GET(req(), { params: { id: "r1" } });
    expect(res.status).toBe(403);
    expect(mocks.prisma.analysisRun.findUnique).toHaveBeenCalledTimes(1);
  });

  it("returns a candidate-safe payload for the run owner", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "owner-1", role: "candidate", tenantIds: [] });
    const { GET } = await import("./route");
    const res = await GET(req(), { params: { id: "r1" } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.context_pack).toBeUndefined();
    expect(data.provider_matrix.agents.architecture.provider).toBe("anthropic_api");
    expect(data.validation_contract).toEqual({ assertions: [] });
    expect(data.repo_intelligence).toEqual({ files: [] });
    expect(data.events[0].output).toBeUndefined();
    expect(data.events[0].key_findings).toContain("Checked architecture");
    expect(data.questions[0].answer).toBe("It wires the app.");
  });

  it("returns the full admin payload only to admins", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin", tenantIds: [] });
    const { GET } = await import("./route");
    const res = await GET(req(), { params: { id: "r1" } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.context_pack).toEqual({ private: "context" });
    expect(data.provider_matrix.agents.architecture.provider).toBe("anthropic_api");
    expect(data.events[0].output.runtime.provider).toBe("anthropic_api");
  });
});
