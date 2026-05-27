import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    cohortStudent: { findMany: vi.fn() },
    analysisRun: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma,
}));

import { CollegeAuthError, buildCollegeReport, getSkillGaps, resolveCollegeScope, tenantRunWhere } from "./tenant";
import type { SessionUser } from "@/lib/auth/session";

function collegeUser(patch: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "user-a",
    email: "college@example.edu",
    name: "College Admin",
    role: "college_admin",
    primaryTenantId: "tenant-a",
    tenantIds: ["tenant-a"],
    ...patch,
  };
}

describe("college tenant scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a requested tenant outside the college user's memberships", () => {
    expect(() => resolveCollegeScope(collegeUser(), "tenant-b")).toThrow(CollegeAuthError);
  });

  it("builds tenant-scoped run filters for non-admin college users", () => {
    const scope = resolveCollegeScope(collegeUser());
    expect(tenantRunWhere(scope, { status: "completed" })).toEqual({
      status: "completed",
      tenantId: { in: ["tenant-a"] },
    });
  });

  it("aggregates weak skills only from tenant-scoped runs", async () => {
    mocks.prisma.analysisRun.findMany.mockResolvedValueOnce([
      {
        id: "run-a",
        scores: [
          { skillName: "Testing", score: 42 },
          { skillName: "Documentation", score: 75 },
        ],
      },
    ]);
    const scope = resolveCollegeScope(collegeUser());
    const payload = await getSkillGaps(scope);

    expect(mocks.prisma.analysisRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: { in: ["tenant-a"] }, status: "completed" }),
      }),
    );
    expect(payload.gaps.find((g) => g.skill === "Testing")?.weak_count).toBe(1);
  });

  it("exports only tenant-scoped report rows", async () => {
    mocks.prisma.analysisRun.findMany.mockResolvedValueOnce([
      {
        candidate: { name: "Student One" },
        repository: { owner: "octo", repoName: "demo" },
        targetRole: "Backend",
        status: "completed",
        overallScore: 81,
        verificationLevel: "repo_interview_verified",
      },
    ]);
    const report = await buildCollegeReport(resolveCollegeScope(collegeUser()), "csv");

    expect(mocks.prisma.analysisRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: { in: ["tenant-a"] } } }),
    );
    expect(report).toContain('"Student One","octo/demo","Backend","completed","81","repo_interview_verified"');
  });
});
