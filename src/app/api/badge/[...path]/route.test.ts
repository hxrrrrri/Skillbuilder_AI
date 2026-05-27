import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    publicProfile: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

describe("/api/badge/[...path]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns SVG with image/svg+xml content-type when profile exists", async () => {
    mocks.prisma.publicProfile.findUnique.mockResolvedValue({
      slug: "alice-repo",
      visibility: "public",
      createdAt: new Date("2026-05-27T00:00:00Z"),
      run: {
        overallScore: 87,
        verificationLevel: "repo_interview_verified",
        targetRole: "Backend Engineer",
        completedAt: new Date("2026-05-27T00:00:00Z"),
        createdAt: new Date("2026-05-27T00:00:00Z"),
      },
      candidate: { name: "Alice", githubUsername: "alice" },
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://test.local/api/badge/alice-repo.svg"), {
      params: { path: ["alice-repo.svg"] },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/svg\+xml/);
    const body = await res.text();
    expect(body).toContain("<svg");
    expect(body).toContain("87/100");
    expect(body).toContain("verified");
  });

  it("returns JSON metadata for .json paths", async () => {
    mocks.prisma.publicProfile.findUnique.mockResolvedValue({
      slug: "alice-repo",
      visibility: "public",
      createdAt: new Date("2026-05-27T00:00:00Z"),
      run: {
        overallScore: 42,
        verificationLevel: "repo_only",
        targetRole: "Frontend Engineer",
        completedAt: new Date("2026-05-27T00:00:00Z"),
        createdAt: new Date("2026-05-27T00:00:00Z"),
      },
      candidate: null,
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://test.local/api/badge/alice-repo.json"), {
      params: { path: ["alice-repo.json"] },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.slug).toBe("alice-repo");
    expect(data.score).toBe(42);
    expect(data.schema_version).toBe("skillproof.badge.v1");
  });

  it("returns 404 not-found SVG when profile missing", async () => {
    mocks.prisma.publicProfile.findUnique.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://test.local/api/badge/missing.svg"), {
      params: { path: ["missing.svg"] },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/image\/svg\+xml/);
    const body = await res.text();
    expect(body).toContain("not found");
  });

  it("hides private profiles", async () => {
    mocks.prisma.publicProfile.findUnique.mockResolvedValue({
      slug: "secret",
      visibility: "private",
      createdAt: new Date(),
      run: { overallScore: 99, verificationLevel: "repo_only", targetRole: "X", completedAt: null, createdAt: new Date() },
      candidate: null,
    });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://test.local/api/badge/secret.svg"), {
      params: { path: ["secret.svg"] },
    });
    expect(res.status).toBe(404);
  });
});
