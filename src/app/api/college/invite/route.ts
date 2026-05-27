import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auth/audit";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CollegeAuthError, InviteCreateBody, ensureCohortInTenant, resolveCollegeScope } from "@/lib/college/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireRole("college_admin", "college_member");
    const scope = resolveCollegeScope(user);
    const invites = await prisma.tenantInvite.findMany({
      where: { tenantId: scope.tenantId },
      orderBy: { createdAt: "desc" },
      include: { cohort: true },
      take: 100,
    });
    return NextResponse.json({ invites });
  } catch (err) {
    if (err instanceof CollegeAuthError) return NextResponse.json({ error: err.code }, { status: err.status });
    return authErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("college_admin", "college_member");
    const scope = resolveCollegeScope(user);
    let body;
    try {
      body = InviteCreateBody.parse(await req.json());
    } catch (err: any) {
      return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
    }
    if (body.cohortId) await ensureCohortInTenant(body.cohortId, scope.tenantId);
    const token = crypto.randomBytes(24).toString("hex");
    const invite = await prisma.tenantInvite.create({
      data: {
        tenantId: scope.tenantId,
        email: body.email,
        role: body.role,
        cohortId: body.cohortId ?? null,
        token,
        expiresAt: new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000),
        createdById: user.id,
      },
    });
    await writeAuditLog({
      action: "college.invite.created",
      actorUserId: user.id,
      tenantId: scope.tenantId,
      targetType: "tenant_invite",
      targetId: invite.id,
      metadata: { email: invite.email, role: invite.role, cohort_id: invite.cohortId },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    return NextResponse.json({ ok: true, invite, url: `${base}/accept-invite?token=${token}` }, { status: 201 });
  } catch (err) {
    if (err instanceof CollegeAuthError) return NextResponse.json({ error: err.code }, { status: err.status });
    return authErrorResponse(err);
  }
}
