import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auth/audit";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  EmployerShareBody,
  collegeErrorResponse,
  ensureCohortInTenant,
  resolveCollegeScope,
} from "@/lib/college/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireRole("college_admin", "college_member");
    const body = EmployerShareBody.parse(await req.json());
    const scope = resolveCollegeScope(user);
    if (body.cohortId) await ensureCohortInTenant(body.cohortId, scope.tenantId);

    const token = crypto.randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000);
    const share = await prisma.talentPoolShare.create({
      data: {
        tenantId: scope.tenantId,
        cohortId: body.cohortId ?? null,
        token,
        filters: JSON.stringify({ minScore: body.minScore ?? null }),
        expiresAt,
        createdById: user.id,
      },
    });
    await writeAuditLog({
      action: "college.employer_share.created",
      actorUserId: user.id,
      tenantId: scope.tenantId,
      targetType: "talent_pool_share",
      targetId: share.id,
      metadata: { cohort_id: body.cohortId ?? null, min_score: body.minScore ?? null, expires_at: expiresAt.toISOString() },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    const url = new URL(req.url);
    return NextResponse.json({ id: share.id, url: `${url.origin}/share/talent-pool/${token}`, expires_at: expiresAt.toISOString() });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (err?.name === "ZodError") {
      return NextResponse.json({ error: "invalid_body", detail: err.message }, { status: 400 });
    }
    try {
      return collegeErrorResponse(err);
    } catch {
      return authErrorResponse(err);
    }
  }
}
