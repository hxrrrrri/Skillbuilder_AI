import { describe, it, expect } from "vitest";
import { tenantScopedWhere } from "./session";
import type { SessionUser } from "./session";

function userWith(role: SessionUser["role"], tenantIds: string[] = []): SessionUser {
  return {
    id: "u1",
    email: "u@x.dev",
    name: "U",
    role,
    primaryTenantId: tenantIds[0] ?? null,
    tenantIds,
  };
}

describe("tenantScopedWhere", () => {
  it("passes through where for platform admins", () => {
    const w = tenantScopedWhere(userWith("admin", ["t1", "t2"]), { status: "active" });
    expect(w).toEqual({ status: "active" });
  });

  it("passes through where for super_admin even with no memberships", () => {
    const w = tenantScopedWhere(userWith("super_admin", []), { status: "active" });
    expect(w).toEqual({ status: "active" });
  });

  it("adds tenantId IN filter for tenant-scoped users with memberships", () => {
    const w = tenantScopedWhere(userWith("college_admin", ["t1", "t2"]), { status: "active" });
    expect(w).toEqual({ status: "active", tenantId: { in: ["t1", "t2"] } });
  });

  it("uses a no-match sentinel when user has no memberships and is not admin", () => {
    const w = tenantScopedWhere(userWith("college_admin", []), { status: "active" });
    expect(w).toEqual({ status: "active", tenantId: "__none__" });
  });

  it("respects a custom tenant field name", () => {
    const w = tenantScopedWhere(
      userWith("employer", ["t1"]),
      { status: "active" },
      "tenantId",
    );
    expect(w).toEqual({ status: "active", tenantId: { in: ["t1"] } });
  });
});
