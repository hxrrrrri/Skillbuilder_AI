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

describe("college API authz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockRejectedValue({ status: 403, code: "forbidden" });
  });

  it("requires college role on protected college APIs", async () => {
    const cohorts = await import("./cohorts/route");
    const cohortDetail = await import("./cohorts/[id]/route");
    const cohortStudents = await import("./cohorts/[id]/students/route");
    const invite = await import("./invite/route");
    const gaps = await import("./skill-gaps/route");
    const placement = await import("./placement-ready/route");
    const reports = await import("./reports/route");
    const share = await import("./employer-share/route");

    const req = new Request("http://test.local/api/college/cohorts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x", email: "student@example.edu" }),
    });
    const getReq = new Request("http://test.local/api/college/cohorts");
    const responses = [
      await cohorts.GET(getReq),
      await cohorts.POST(req.clone()),
      await cohortDetail.GET(getReq, { params: { id: "cohort-1" } }),
      await cohortStudents.POST(req.clone(), { params: { id: "cohort-1" } }),
      await invite.GET(),
      await invite.POST(req.clone()),
      await gaps.GET(getReq),
      await placement.GET(getReq),
      await reports.GET(getReq),
      await share.POST(req.clone()),
    ];

    expect(responses.map((r) => r.status)).toEqual(Array(responses.length).fill(403));
    expect(mocks.requireRole).toHaveBeenCalledTimes(responses.length);
    expect(mocks.requireRole.mock.calls.every((call) => call[0] === "college_admin" && call[1] === "college_member")).toBe(true);
  });
});
