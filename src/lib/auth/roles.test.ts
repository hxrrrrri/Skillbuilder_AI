import { describe, it, expect } from "vitest";
import {
  ROLES,
  isRole,
  canAccessPath,
  isPathProtected,
  landingPathForRole,
  rolesAllowedForPath,
  isAdminRole,
  isCollegeRole,
} from "./roles";

describe("roles registry", () => {
  it("contains expected roles", () => {
    expect(ROLES).toContain("candidate");
    expect(ROLES).toContain("employer");
    expect(ROLES).toContain("college_admin");
    expect(ROLES).toContain("admin");
    expect(ROLES).toContain("super_admin");
  });

  it("isRole only accepts known role strings", () => {
    expect(isRole("candidate")).toBe(true);
    expect(isRole("CANDIDATE")).toBe(false);
    expect(isRole("hacker")).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(123)).toBe(false);
  });

  it("landingPathForRole maps every role to a route", () => {
    for (const r of ROLES) {
      expect(landingPathForRole(r)).toMatch(/^\/(admin|candidate|employer|college)\/dashboard$/);
    }
  });
});

describe("canAccessPath", () => {
  it("locks /admin to admin and super_admin only", () => {
    expect(canAccessPath("admin", "/admin/dashboard")).toBe(true);
    expect(canAccessPath("super_admin", "/admin/users")).toBe(true);
    expect(canAccessPath("candidate", "/admin/dashboard")).toBe(false);
    expect(canAccessPath("employer", "/admin/dashboard")).toBe(false);
    expect(canAccessPath("college_admin", "/admin/dashboard")).toBe(false);
  });

  it("locks /candidate to candidate + platform admins", () => {
    expect(canAccessPath("candidate", "/candidate/dashboard")).toBe(true);
    expect(canAccessPath("admin", "/candidate/runs")).toBe(true);
    expect(canAccessPath("super_admin", "/candidate/profile")).toBe(true);
    expect(canAccessPath("employer", "/candidate/dashboard")).toBe(false);
    expect(canAccessPath("college_admin", "/candidate/dashboard")).toBe(false);
  });

  it("locks /employer to employer + platform admins", () => {
    expect(canAccessPath("employer", "/employer/candidates")).toBe(true);
    expect(canAccessPath("admin", "/employer/dashboard")).toBe(true);
    expect(canAccessPath("candidate", "/employer/dashboard")).toBe(false);
    expect(canAccessPath("college_admin", "/employer/dashboard")).toBe(false);
  });

  it("locks /college to college_admin, college_member + platform admins", () => {
    expect(canAccessPath("college_admin", "/college/students")).toBe(true);
    expect(canAccessPath("college_member", "/college/dashboard")).toBe(true);
    expect(canAccessPath("admin", "/college/dashboard")).toBe(true);
    expect(canAccessPath("candidate", "/college/dashboard")).toBe(false);
    expect(canAccessPath("employer", "/college/dashboard")).toBe(false);
  });

  it("returns true for unprotected paths regardless of role", () => {
    expect(canAccessPath("candidate", "/")).toBe(true);
    expect(canAccessPath("employer", "/login")).toBe(true);
    expect(canAccessPath("candidate", "/profile/some-public-slug")).toBe(true);
  });

  it("does not match adjacent paths that share a prefix substring", () => {
    // /admin matches /admin and /admin/... but not /admins or /administration
    expect(isPathProtected("/administrative")).toBe(false);
    expect(isPathProtected("/candidates-public")).toBe(false);
    expect(isPathProtected("/admin")).toBe(true);
    expect(isPathProtected("/admin/dashboard")).toBe(true);
  });
});

describe("role helpers", () => {
  it("isAdminRole only accepts admin / super_admin", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("super_admin")).toBe(true);
    expect(isAdminRole("candidate")).toBe(false);
    expect(isAdminRole("college_admin")).toBe(false);
  });

  it("isCollegeRole only accepts college_admin / college_member", () => {
    expect(isCollegeRole("college_admin")).toBe(true);
    expect(isCollegeRole("college_member")).toBe(true);
    expect(isCollegeRole("admin")).toBe(false);
  });

  it("rolesAllowedForPath returns null for public paths", () => {
    expect(rolesAllowedForPath("/login")).toBeNull();
    expect(rolesAllowedForPath("/")).toBeNull();
    expect(rolesAllowedForPath("/profile/foo")).toBeNull();
  });
});
