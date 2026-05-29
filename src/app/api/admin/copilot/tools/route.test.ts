import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

// Real requireAdminApi + real RBAC; only the session lookup is mocked.
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/session");
  return { ...actual, getCurrentUser: mocks.getCurrentUser };
});
vi.mock("@/lib/db", () => ({ prisma: {} }));

describe("/api/admin/copilot/tools (#1/#2 admin-only)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin (candidate)", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "candidate" });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the tool registry for an admin (incl. forbidden tools, listed but non-executable)", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "a1", role: "admin" });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.tools.map((t: any) => t.name);
    expect(names).toContain("bulk_set_agent_provider");
    expect(names).toContain("reveal_secrets");
    expect(body.tools.find((t: any) => t.name === "reveal_secrets").risk).toBe("forbidden");
  });
});
