import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { collegeErrorResponse, getPlacementReady, resolveCollegeScope } from "@/lib/college/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireRole("college_admin", "college_member");
    const url = new URL(req.url);
    const scope = resolveCollegeScope(user, url.searchParams.get("tenant_id"));
    const rows = await getPlacementReady(scope);
    return NextResponse.json({ rows });
  } catch (err) {
    if (err instanceof Response) return err;
    try {
      return collegeErrorResponse(err);
    } catch {
      return authErrorResponse(err);
    }
  }
}
