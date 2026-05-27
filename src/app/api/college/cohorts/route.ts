import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auth/audit";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CohortCreateBody, CollegeAuthError, resolveCollegeScope } from "@/lib/college/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireRole("college_admin", "college_member");
    const tenantId = new URL(req.url).searchParams.get("tenant_id");
    const scope = resolveCollegeScope(user, tenantId);
    const cohorts = await prisma.cohort.findMany({
      where: { tenantId: scope.tenantId },
      orderBy: { createdAt: "desc" },
      include: { students: true },
    });
    return NextResponse.json({
      cohorts: cohorts.map((c) => ({
        id: c.id,
        name: c.name,
        year: c.year,
        notes: c.notes,
        createdAt: c.createdAt,
        studentCount: c.students.length,
      })),
    });
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
      body = CohortCreateBody.parse(await req.json());
    } catch (err: any) {
      return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
    }
    const cohort = await prisma.cohort.create({
      data: {
        tenantId: scope.tenantId,
        name: body.name,
        year: body.year ?? null,
        notes: body.notes ?? null,
      },
    });
    await writeAuditLog({
      action: "college.cohort.created",
      actorUserId: user.id,
      tenantId: scope.tenantId,
      targetType: "cohort",
      targetId: cohort.id,
      metadata: { name: cohort.name, year: cohort.year },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({ ok: true, cohort }, { status: 201 });
  } catch (err) {
    if (err instanceof CollegeAuthError) return NextResponse.json({ error: err.code }, { status: err.status });
    return authErrorResponse(err);
  }
}
