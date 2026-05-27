import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auth/audit";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  EmployerSearchQuery,
  fetchPublicProfileBundles,
  filterEmployerSummaries,
  summarizeEmployerProfile,
} from "@/lib/employer/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireRole("employer");
    const url = new URL(req.url);
    const parsed = EmployerSearchQuery.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_query", detail: parsed.error.message }, { status: 400 });
    }
    const filters = parsed.data;
    const where: Record<string, any> = {};
    if (filters.target_role) {
      where.run = { ...(where.run ?? {}), targetRole: { contains: filters.target_role } };
    }
    if (filters.min_score != null) {
      where.run = { ...(where.run ?? {}), overallScore: { gte: filters.min_score } };
    }
    if (filters.verification_level) {
      where.run = { ...(where.run ?? {}), verificationLevel: filters.verification_level };
    }
    if (filters.college_tenant_id) {
      where.run = { ...(where.run ?? {}), tenantId: filters.college_tenant_id };
    }

    const bundles = await fetchPublicProfileBundles(where, filters.limit);
    const summaries = filterEmployerSummaries(bundles.map(summarizeEmployerProfile), filters).slice(0, filters.limit);

    let savedSearch = null;
    if (filters.save_name) {
      const query = JSON.stringify({ ...filters, save_name: undefined });
      savedSearch = await prisma.savedSearch.create({
        data: {
          ownerUserId: user.id,
          name: filters.save_name,
          query,
        },
      });
      await writeAuditLog({
        action: "employer.search.saved",
        actorUserId: user.id,
        tenantId: user.primaryTenantId,
        targetType: "saved_search",
        targetId: savedSearch.id,
        metadata: { name: savedSearch.name, query },
        ip: req.headers.get("x-forwarded-for") ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
      });
    }

    return NextResponse.json({ results: summaries, saved_search: savedSearch });
  } catch (err) {
    return authErrorResponse(err);
  }
}
