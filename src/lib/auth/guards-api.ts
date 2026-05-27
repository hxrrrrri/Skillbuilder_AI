import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "./session";
import { isAdminRole } from "./roles";

/**
 * Returns the current user if they are admin/super_admin, returns null if no user
 * is signed in (anonymous — allowed for first-run setup flows), and throws an
 * HTTP 403 NextResponse if a non-admin user is signed in.
 */
export async function adminOrAnonymous(): Promise<{ user: SessionUser | null } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return { user: null };
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return { user };
}

export async function requireAdminApi(): Promise<{ user: SessionUser } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!isAdminRole(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return { user };
}

export function isNextResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
