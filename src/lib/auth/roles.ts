export const ROLES = [
  "candidate",
  "employer",
  "college_admin",
  "college_member",
  "admin",
  "super_admin",
] as const;

export type Role = (typeof ROLES)[number];

export const TENANT_KINDS = ["college", "employer", "platform"] as const;
export type TenantKind = (typeof TENANT_KINDS)[number];

export const TENANT_MEMBER_ROLES = ["admin", "member", "mentor", "officer"] as const;
export type TenantMemberRole = (typeof TENANT_MEMBER_ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

const ROLE_LANDING: Record<Role, string> = {
  candidate: "/candidate/dashboard",
  employer: "/employer/dashboard",
  college_admin: "/college/dashboard",
  college_member: "/college/dashboard",
  admin: "/admin/dashboard",
  super_admin: "/admin/dashboard",
};

export function landingPathForRole(role: Role): string {
  return ROLE_LANDING[role];
}

const ROLE_PREFIX_MATRIX: Record<string, Role[]> = {
  "/admin": ["admin", "super_admin"],
  "/candidate": ["candidate", "admin", "super_admin"],
  "/employer": ["employer", "admin", "super_admin"],
  "/college": ["college_admin", "college_member", "admin", "super_admin"],
};

export function rolesAllowedForPath(pathname: string): Role[] | null {
  for (const prefix of Object.keys(ROLE_PREFIX_MATRIX)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return ROLE_PREFIX_MATRIX[prefix];
    }
  }
  return null;
}

export function isPathProtected(pathname: string): boolean {
  return rolesAllowedForPath(pathname) !== null;
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const allowed = rolesAllowedForPath(pathname);
  if (!allowed) return true;
  return allowed.includes(role);
}

export function isAdminRole(role: Role): boolean {
  return role === "admin" || role === "super_admin";
}

export function isCollegeRole(role: Role): boolean {
  return role === "college_admin" || role === "college_member";
}
