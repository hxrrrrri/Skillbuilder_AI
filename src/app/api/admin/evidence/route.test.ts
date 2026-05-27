import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  prisma: { skillScore: { findMany: vi.fn() } },
}));

vi.mock("@/lib/auth/guards-api", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/guards-api");
  return { ...actual, requireAdminApi: mocks.requireAdminApi };
});
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

describe("/api/admin/evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin", async () => {
    mocks.requireAdminApi.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    const { GET } = await import("./route");
    const res = await GET(new Request("http://test.local/api/admin/evidence"));
    expect(res.status).toBe(403);
    expect(mocks.prisma.skillScore.findMany).not.toHaveBeenCalled();
  });

  it("flattens evidence rows across scores and applies source + free-text filters", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      user: { id: "admin1", role: "admin", tenantIds: [], primaryTenantId: null, email: "a@x", name: "A" },
    });
    mocks.prisma.skillScore.findMany.mockResolvedValue([
      {
        id: "s1",
        runId: "r1",
        skillName: "Testing",
        score: 70,
        scoreSource: "llm",
        run: { id: "r1", candidateId: "c1", repoId: "rp1", repository: { owner: "o", repoName: "r" } },
        evidence: JSON.stringify([
          { source: "challenge", reason: "fix added test for parseRepoUrl", file: "src/lib/utils.ts" },
          { source: "interview", reason: "candidate explained edge case" },
          { source: "repo", reason: "test file count low" },
        ]),
      },
    ]);
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://test.local/api/admin/evidence?source=challenge&q=parseRepoUrl"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.rows[0].item.source).toBe("challenge");
    expect(data.rows[0].item.file).toBe("src/lib/utils.ts");
  });
});
