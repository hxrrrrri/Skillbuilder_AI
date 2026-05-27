import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { SessionUser } from "./session";

vi.mock("./session", () => {
  return {
    getCurrentUser: vi.fn(async () => null),
  };
});

const sessionMod = await import("./session");
const { adminOrAnonymous, requireAdminApi, isNextResponse } = await import("./guards-api");

const getCurrentUser = sessionMod.getCurrentUser as unknown as ReturnType<typeof vi.fn>;

function userWith(role: SessionUser["role"]): SessionUser {
  return {
    id: "u1",
    email: "u@x.dev",
    name: "U",
    role,
    primaryTenantId: null,
    tenantIds: [],
  };
}

describe("adminOrAnonymous", () => {
  beforeEach(() => getCurrentUser.mockReset());

  it("returns { user: null } when no one is signed in", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await adminOrAnonymous();
    expect(isNextResponse(res)).toBe(false);
    expect((res as any).user).toBeNull();
  });

  it("returns { user } when an admin is signed in", async () => {
    getCurrentUser.mockResolvedValue(userWith("admin"));
    const res = await adminOrAnonymous();
    expect(isNextResponse(res)).toBe(false);
    expect((res as any).user.role).toBe("admin");
  });

  it("returns { user } when a super_admin is signed in", async () => {
    getCurrentUser.mockResolvedValue(userWith("super_admin"));
    const res = await adminOrAnonymous();
    expect(isNextResponse(res)).toBe(false);
    expect((res as any).user.role).toBe("super_admin");
  });

  const NON_ADMIN_ROLES = [
    "candidate",
    "employer",
    "college_admin",
    "college_member",
  ] as const;

  it.each(NON_ADMIN_ROLES)(
    "returns 403 NextResponse for non-admin role %s",
    async (role) => {
      getCurrentUser.mockResolvedValue(userWith(role));
      const res = await adminOrAnonymous();
      expect(isNextResponse(res)).toBe(true);
      expect((res as NextResponse).status).toBe(403);
    },
  );
});

describe("requireAdminApi", () => {
  beforeEach(() => getCurrentUser.mockReset());

  it("returns 401 NextResponse when no user is signed in", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await requireAdminApi();
    expect(isNextResponse(res)).toBe(true);
    expect((res as NextResponse).status).toBe(401);
  });

  it("returns 403 NextResponse for non-admin", async () => {
    getCurrentUser.mockResolvedValue(userWith("employer"));
    const res = await requireAdminApi();
    expect(isNextResponse(res)).toBe(true);
    expect((res as NextResponse).status).toBe(403);
  });

  it("returns { user } for admin", async () => {
    getCurrentUser.mockResolvedValue(userWith("admin"));
    const res = await requireAdminApi();
    expect(isNextResponse(res)).toBe(false);
    expect((res as any).user.role).toBe("admin");
  });

  it("returns { user } for super_admin", async () => {
    getCurrentUser.mockResolvedValue(userWith("super_admin"));
    const res = await requireAdminApi();
    expect(isNextResponse(res)).toBe(false);
    expect((res as any).user.role).toBe("super_admin");
  });
});
