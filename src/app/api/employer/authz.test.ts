import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: mocks.requireRole,
  authErrorResponse: (err: any) =>
    Response.json({ error: err?.code ?? "forbidden" }, { status: err?.status ?? 500 }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {},
}));

vi.mock("@/lib/auth/audit", () => ({
  writeAuditLog: vi.fn(),
}));

describe("employer API authz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockRejectedValue({ status: 403, code: "forbidden" });
  });

  it("requires employer-or-admin role on every employer API", async () => {
    const search = await import("./search/route");
    const candidate = await import("./candidates/[id]/route");
    const shortlist = await import("./shortlist/route");
    const shortlistDetail = await import("./shortlist/[id]/route");
    const shortlistItems = await import("./shortlist/[id]/items/route");
    const shortlistItem = await import("./shortlist/[id]/items/[itemId]/route");
    const compare = await import("./compare/route");
    const kit = await import("./interview-kit/route");

    const req = new Request("http://test.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile_ids: ["p1", "p2"], profile_id: "p1", public_profile_id: "p1", name: "x" }),
    });
    const getReq = new Request("http://test.local");

    const responses = [
      await search.GET(getReq),
      await candidate.GET(getReq, { params: { id: "p1" } }),
      await shortlist.GET(),
      await shortlist.POST(req.clone()),
      await shortlistDetail.GET(getReq, { params: { id: "s1" } }),
      await shortlistItems.POST(req.clone(), { params: { id: "s1" } }),
      await shortlistItem.DELETE(getReq, { params: { id: "s1", itemId: "i1" } }),
      await compare.POST(req.clone()),
      await kit.POST(req.clone()),
    ];

    expect(responses.map((r) => r.status)).toEqual(Array(responses.length).fill(403));
    expect(mocks.requireRole).toHaveBeenCalledTimes(responses.length);
    expect(mocks.requireRole.mock.calls.every((call) => call[0] === "employer")).toBe(true);
  });
});
