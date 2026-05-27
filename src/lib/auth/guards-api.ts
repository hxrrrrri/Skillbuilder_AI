import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "./session";
import { isAdminRole, isCollegeRole } from "./roles";

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

/**
 * Minimal shape of an AnalysisRun needed to enforce access. Pass only the fields
 * required so callers can `select` narrowly.
 */
export type RunAccessSubject = {
  candidateId: string | null;
  createdByUserId: string | null;
  tenantId: string | null;
  /** Candidate.userId — the user that "owns" the candidate record this run is for. */
  candidateUserId?: string | null;
};

export type RunAccessDecision =
  | { ok: true; user: SessionUser; reason: "admin" | "creator" | "candidate_owner" | "tenant_member" }
  | { ok: false; response: NextResponse; reason: "unauthenticated" | "forbidden" };

/**
 * Centralized policy for "who can read this AnalysisRun?".
 *
 * Allow when:
 *  - admin / super_admin (any run)
 *  - the user that created the run (`createdByUserId`)
 *  - the candidate the run is for (Candidate.userId === user.id)
 *  - a college tenant member whose `tenantIds` includes `run.tenantId`
 *
 * Employers do NOT get run-level access here; they consume `PublicProfile`s.
 */
export function evaluateRunAccess(
  user: SessionUser | null,
  run: RunAccessSubject,
): RunAccessDecision {
  if (!user) {
    return {
      ok: false,
      reason: "unauthenticated",
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }

  if (isAdminRole(user.role)) {
    return { ok: true, user, reason: "admin" };
  }

  if (run.createdByUserId && run.createdByUserId === user.id) {
    return { ok: true, user, reason: "creator" };
  }

  if (run.candidateUserId && run.candidateUserId === user.id) {
    return { ok: true, user, reason: "candidate_owner" };
  }

  if (
    isCollegeRole(user.role) &&
    run.tenantId &&
    user.tenantIds.includes(run.tenantId)
  ) {
    return { ok: true, user, reason: "tenant_member" };
  }

  return {
    ok: false,
    reason: "forbidden",
    response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
  };
}
