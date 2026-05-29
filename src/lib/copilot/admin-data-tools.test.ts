import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";

const mocks = vi.hoisted(() => ({
  prisma: {
    publicProfile: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    candidate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/registry", () => ({
  listAgentConfigs: vi.fn(async () => []),
  listProviderConfigs: vi.fn(async () => []),
  getAgentConfig: vi.fn(),
  updateAgentConfig: vi.fn(),
  updateProviderConfig: vi.fn(),
  listPromptVersions: vi.fn(async () => []),
  createPromptVersion: vi.fn(),
  activatePromptVersion: vi.fn(),
  getActivePrompt: vi.fn(),
}));
vi.mock("@/lib/providers/provider-router", () => ({
  listProviderHealth: vi.fn(async () => []),
  checkProviderReadinessForMode: vi.fn(async () => ({ ok: true, blockers: [] })),
}));
vi.mock("@/lib/providers/cache", () => ({ invalidateProviderRegistryCache: vi.fn() }));

import { getTool, resolveToolPermission, type ToolContext } from "./tools";

const admin: SessionUser = { id: "a1", email: "admin@x.dev", name: "Admin", role: "admin", primaryTenantId: null, tenantIds: [] };
const candidateUser: SessionUser = { id: "u1", email: "student@x.dev", name: "Student", role: "candidate", primaryTenantId: null, tenantIds: [] };
const adminCtx: ToolContext = { user: admin, mode: "admin" };

const profileRow = {
  id: "profile_1",
  slug: "ada-lovelace-backend",
  visibility: "public",
  createdAt: new Date("2026-05-01T10:00:00Z"),
  owner: { id: "u1", email: "student@x.dev" },
  candidate: {
    id: "cand_1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    githubUsername: "ada",
    cohortMemberships: [{ cohort: { id: "cohort_1", name: "2026 Batch", year: 2026, tenant: { id: "tenant_1", name: "Skill College" } } }],
  },
  run: {
    id: "run_1",
    status: "completed",
    targetRole: "Backend Engineer",
    overallScore: 91,
    verificationLevel: "repo_interview_verified",
    completedAt: new Date("2026-05-01T09:00:00Z"),
    tenant: { id: "tenant_1", name: "Skill College" },
    repository: { owner: "ada", repoName: "api", repoUrl: "https://github.com/ada/api" },
    scores: [
      { skillName: "Testing", score: 96, scoreSource: "terminal" },
      { skillName: "Architecture", score: 90, scoreSource: "llm" },
      { skillName: "Security", score: 84, scoreSource: "llm" },
      { skillName: "Documentation", score: 61, scoreSource: "llm" },
    ],
  },
};

const candidateRow = {
  id: "cand_1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  githubUsername: "ada",
  user: {
    id: "u1",
    email: "student@x.dev",
    name: "Ada",
    role: "candidate",
    status: "active",
    passwordHash: "secret-password-hash",
    memberships: [{ tenant: { id: "tenant_1", name: "Skill College", kind: "college" }, role: "member" }],
    primaryTenant: { id: "tenant_1", name: "Skill College", kind: "college" },
  },
  cohortMemberships: [{ cohort: { id: "cohort_1", name: "2026 Batch", year: 2026, tenant: { id: "tenant_1", name: "Skill College" } } }],
  repositories: [{ id: "repo_1", owner: "ada", repoName: "api", repoUrl: "https://github.com/ada/api", primaryLanguage: "TypeScript" }],
  runs: [{
    id: "run_1",
    status: "completed",
    targetRole: "Backend Engineer",
    overallScore: 91,
    verificationLevel: "repo_interview_verified",
    ownershipStatus: JSON.stringify({ confidence: "verified", token: "sk-secret-token-value" }),
    terminalEvidence: JSON.stringify([{ exitCode: 0 }]),
    improvementPlan: JSON.stringify({ summary: "Improve docs", secret: "sk-ant-abc1234567890" }),
    employerVerifier: JSON.stringify({ recommendation: "strong" }),
    authenticitySignals: JSON.stringify({ confidence: "high" }),
    completedAt: new Date("2026-05-01T09:00:00Z"),
    repository: { id: "repo_1", owner: "ada", repoName: "api", repoUrl: "https://github.com/ada/api" },
    scores: [{ skillName: "Testing", score: 96, scoreSource: "terminal" }],
    evidenceFindings: [{ category: "tests" }, { category: "architecture" }],
    questions: [{ id: "q1", answer: "yes" }, { id: "q2", answer: null }],
    profiles: [{ id: "profile_1", slug: "ada-lovelace-backend", visibility: "public", createdAt: new Date("2026-05-01T10:00:00Z") }],
  }],
  profiles: [{ id: "profile_1", slug: "ada-lovelace-backend", visibility: "public", createdAt: new Date("2026-05-01T10:00:00Z") }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.publicProfile.findMany.mockResolvedValue([profileRow]);
  mocks.prisma.publicProfile.findFirst.mockResolvedValue(profileRow);
  mocks.prisma.candidate.findMany.mockResolvedValue([candidateRow]);
  mocks.prisma.candidate.findFirst.mockResolvedValue(candidateRow);
});

describe("admin data tools", () => {
  it("list_students_with_profiles returns profile-linked student details and routes", async () => {
    const tool = getTool("list_students_with_profiles");
    expect(tool).toBeDefined();

    const result = await tool!.run!(adminCtx, { visibility: "public", limit: 20 }) as any;

    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(result.items[0]).toMatchObject({
      candidate: { id: "cand_1", name: "Ada Lovelace", email: "ada@example.com", githubUsername: "ada" },
      profile: { id: "profile_1", slug: "ada-lovelace-backend", visibility: "public", route: "/profile/ada-lovelace-backend" },
      run: { id: "run_1", status: "completed", targetRole: "Backend Engineer", overallScore: 91 },
      repository: { owner: "ada", name: "api", url: "https://github.com/ada/api" },
    });
    expect(result.items[0].skills.top.map((s: any) => s.skillName)).toEqual(["Testing", "Architecture", "Security"]);
    expect(result.items[0].routes).toContain("/admin/runs/run_1");
  });

  it("search_candidates_admin supports hasProfile, completed run, minScore, q, tenant, and cohort filters", async () => {
    const tool = getTool("search_candidates_admin");
    expect(tool).toBeDefined();

    const result = await tool!.run!(adminCtx, {
      q: "ada",
      hasProfile: true,
      hasCompletedRun: true,
      minScore: 70,
      tenantId: "tenant_1",
      cohortId: "cohort_1",
      limit: 10,
    }) as any;

    expect(result.ok).toBe(true);
    expect(result.items[0]).toMatchObject({
      candidate: { id: "cand_1", name: "Ada Lovelace" },
      linkedUserEmail: "student@x.dev",
      runsCount: 1,
      profilesCount: 1,
      bestScore: 91,
      latestProfileSlug: "ada-lovelace-backend",
    });
    expect(mocks.prisma.candidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          profiles: { some: {} },
          runs: expect.objectContaining({ some: expect.objectContaining({ status: "completed", tenantId: "tenant_1" }) }),
          cohortMemberships: { some: { cohortId: "cohort_1" } },
        }),
        take: 10,
      }),
    );
  });

  it("get_student_profile_admin works by candidateId, email, githubUsername, and profileSlug", async () => {
    const tool = getTool("get_student_profile_admin");
    expect(tool).toBeDefined();

    for (const input of [
      { candidateId: "cand_1" },
      { email: "ada@example.com" },
      { githubUsername: "ada" },
      { profileSlug: "ada-lovelace-backend" },
    ]) {
      const result = await tool!.run!(adminCtx, input) as any;
      expect(result.ok).toBe(true);
      expect(result.detail.candidate.email).toBe("ada@example.com");
      expect(result.detail.routes).toEqual(expect.arrayContaining(["/profile/ada-lovelace-backend", "/admin/runs/run_1"]));
    }

    expect(mocks.prisma.candidate.findFirst).toHaveBeenCalledTimes(4);
  });

  it("redacts sensitive fields and secret-shaped values from admin tool output", async () => {
    const tool = getTool("get_student_profile_admin")!;
    const result = await tool.run!(adminCtx, { candidateId: "cand_1" });
    const json = JSON.stringify(result).toLowerCase();

    expect(json).not.toContain("secret-password-hash");
    expect(json).not.toContain("sk-ant-abc");
    expect(json).not.toContain("sk-secret-token-value");
    expect(json).toContain("[redacted]");
  });

  it("new admin tools remain unavailable to non-admin and help-mode users", () => {
    const nonAdminCtx: ToolContext = { user: candidateUser, mode: "admin" };
    const helpCtx: ToolContext = { user: candidateUser, mode: "help" };

    expect(resolveToolPermission("list_students_with_profiles", nonAdminCtx)).toMatchObject({ allowed: false, reason: "forbidden_role" });
    expect(resolveToolPermission("list_students_with_profiles", helpCtx)).toMatchObject({ allowed: false, reason: "mode_mismatch" });
  });
});
