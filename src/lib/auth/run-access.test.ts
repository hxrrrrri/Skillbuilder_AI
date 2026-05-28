import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import type { SessionUser } from "./session";
import { evaluateRunAccess, evaluateRunMutationAccess, isNextResponse } from "./guards-api";

function userWith(
  role: SessionUser["role"],
  overrides: Partial<SessionUser> = {},
): SessionUser {
  return {
    id: "u1",
    email: "u@x.dev",
    name: "U",
    role,
    primaryTenantId: null,
    tenantIds: [],
    ...overrides,
  };
}

const baseRun = {
  candidateId: null as string | null,
  createdByUserId: null as string | null,
  tenantId: null as string | null,
  candidateUserId: null as string | null,
};

describe("evaluateRunAccess", () => {
  it("returns 401 when no user is signed in", () => {
    const r = evaluateRunAccess(null, baseRun);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unauthenticated");
    expect(isNextResponse(r.response)).toBe(true);
    expect(r.response.status).toBe(401);
  });

  it("admin can read any run", () => {
    const r = evaluateRunAccess(userWith("admin"), baseRun);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reason).toBe("admin");
  });

  it("super_admin can read any run", () => {
    const r = evaluateRunAccess(userWith("super_admin"), baseRun);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reason).toBe("admin");
  });

  it("creator can read their own run", () => {
    const user = userWith("candidate", { id: "user-A" });
    const r = evaluateRunAccess(user, { ...baseRun, createdByUserId: "user-A" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reason).toBe("creator");
  });

  it("candidate owner can read their run via Candidate.userId link", () => {
    const user = userWith("candidate", { id: "user-A" });
    const r = evaluateRunAccess(user, {
      ...baseRun,
      candidateId: "cand-1",
      candidateUserId: "user-A",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reason).toBe("candidate_owner");
  });

  it("candidate cannot read another candidate's run", () => {
    const user = userWith("candidate", { id: "user-A" });
    const r = evaluateRunAccess(user, {
      ...baseRun,
      candidateId: "cand-2",
      candidateUserId: "user-B",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("forbidden");
    expect(r.response.status).toBe(403);
  });

  it("college member can read a run within their tenant", () => {
    const user = userWith("college_member", {
      id: "user-A",
      tenantIds: ["tenant-1", "tenant-2"],
    });
    const r = evaluateRunAccess(user, { ...baseRun, tenantId: "tenant-2" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reason).toBe("tenant_member");
  });

  it("college_admin in a different tenant gets 403", () => {
    const user = userWith("college_admin", {
      id: "user-A",
      tenantIds: ["tenant-1"],
    });
    const r = evaluateRunAccess(user, { ...baseRun, tenantId: "tenant-2" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(403);
  });

  it("college member with no tenantIds cannot read tenant-less run", () => {
    const user = userWith("college_member", { id: "user-A", tenantIds: [] });
    const r = evaluateRunAccess(user, { ...baseRun, tenantId: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(403);
  });

  it("employer cannot read a run directly (must go through public profiles)", () => {
    const user = userWith("employer", {
      id: "user-E",
      tenantIds: ["tenant-9"],
    });
    const r = evaluateRunAccess(user, { ...baseRun, tenantId: "tenant-9" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(403);
  });

  it("creator match wins even if tenant doesn't", () => {
    const user = userWith("candidate", { id: "user-A", tenantIds: [] });
    const r = evaluateRunAccess(user, {
      ...baseRun,
      createdByUserId: "user-A",
      tenantId: "tenant-other",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reason).toBe("creator");
  });

  it("response objects are real NextResponse instances", () => {
    const r = evaluateRunAccess(null, baseRun);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response).toBeInstanceOf(NextResponse);
  });
});

describe("evaluateRunMutationAccess", () => {
  it("returns 401 when no user is signed in", () => {
    const r = evaluateRunMutationAccess(null, baseRun, "submit_interview_answer");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unauthenticated");
    expect(r.response.status).toBe(401);
  });

  it("candidate can submit their own interview answer", () => {
    const user = userWith("candidate", { id: "user-A" });
    const r = evaluateRunMutationAccess(
      user,
      { ...baseRun, candidateUserId: "user-A" },
      "submit_interview_answer",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reason).toBe("candidate_owner");
  });

  it("candidate cannot submit another candidate's answer", () => {
    const user = userWith("candidate", { id: "user-A" });
    const r = evaluateRunMutationAccess(
      user,
      { ...baseRun, candidateUserId: "user-B", createdByUserId: "user-B" },
      "submit_interview_answer",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(403);
  });

  it("college cannot submit interview or AI challenge mutations", () => {
    const user = userWith("college_admin", { id: "college-A", tenantIds: ["tenant-1"] });
    for (const action of ["submit_interview_answer", "submit_ai_challenge"] as const) {
      const r = evaluateRunMutationAccess(user, { ...baseRun, tenantId: "tenant-1" }, action);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.response.status).toBe(403);
    }
  });

  it("employer cannot mutate candidate proof", () => {
    const user = userWith("employer", { id: "employer-A", tenantIds: ["tenant-1"] });
    const r = evaluateRunMutationAccess(user, { ...baseRun, tenantId: "tenant-1" }, "publish_profile");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(403);
  });

  it("admin can override proof mutations", () => {
    const r = evaluateRunMutationAccess(userWith("admin"), baseRun, "verify_ownership");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reason).toBe("admin");
  });
});
