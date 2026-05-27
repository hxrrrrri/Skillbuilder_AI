import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./options";
import { isAdminRole, type Role } from "./roles";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  primaryTenantId: string | null;
  tenantIds: string[];
  image?: string | null;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session.user as SessionUser;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new HttpAuthError(401, "unauthenticated");
  }
  return user;
}

export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role) && !isAdminRole(user.role)) {
    throw new HttpAuthError(403, "forbidden");
  }
  return user;
}

export async function requireExactRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
    throw new HttpAuthError(403, "forbidden");
  }
  return user;
}

export async function requireTenant(tenantId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (isAdminRole(user.role)) return user;
  if (!user.tenantIds.includes(tenantId)) {
    throw new HttpAuthError(403, "forbidden_tenant");
  }
  return user;
}

export class HttpAuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function authErrorResponse(err: unknown): NextResponse {
  if (err instanceof HttpAuthError) {
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
  console.error("[auth] unexpected error", err);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

export function tenantScopedWhere<T extends Record<string, any>>(
  user: SessionUser,
  base: T,
  tenantField: string = "tenantId",
): T & Record<string, unknown> {
  if (isAdminRole(user.role)) return base;
  if (user.tenantIds.length === 0) {
    return { ...(base as any), [tenantField]: "__none__" };
  }
  return { ...(base as any), [tenantField]: { in: user.tenantIds } };
}
