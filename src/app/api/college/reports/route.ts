import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { buildCollegeReport, collegeErrorResponse, resolveCollegeScope } from "@/lib/college/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireRole("college_admin", "college_member");
    const url = new URL(req.url);
    const format = url.searchParams.get("format") === "md" ? "md" : "csv";
    const scope = resolveCollegeScope(user, url.searchParams.get("tenant_id"));
    const report = await buildCollegeReport(scope, format);
    return new Response(report, {
      headers: {
        "content-type": format === "md" ? "text/markdown; charset=utf-8" : "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="skillproof-college-report.${format}"`,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    try {
      return collegeErrorResponse(err);
    } catch {
      return authErrorResponse(err);
    }
  }
}
