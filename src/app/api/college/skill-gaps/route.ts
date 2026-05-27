import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import {
  collegeErrorResponse,
  ensureCohortInTenant,
  getSkillGaps,
  resolveCollegeScope,
} from "@/lib/college/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireRole("college_admin", "college_member");
    const url = new URL(req.url);
    const scope = resolveCollegeScope(user, url.searchParams.get("tenant_id"));
    const cohortId = url.searchParams.get("cohort_id");
    if (cohortId) await ensureCohortInTenant(cohortId, scope.tenantId);
    const payload = await getSkillGaps(scope, cohortId);
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof Response) return err;
    try {
      return collegeErrorResponse(err);
    } catch {
      return authErrorResponse(err);
    }
  }
}
