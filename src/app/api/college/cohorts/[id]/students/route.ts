import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/auth/audit";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CollegeAuthError, ensureCohortInTenant, resolveCollegeScope } from "@/lib/college/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("college_admin", "college_member");
    const scope = resolveCollegeScope(user);
    await ensureCohortInTenant(params.id, scope.tenantId);
    let body: z.infer<typeof Body>;
    try {
      body = Body.parse(await req.json());
    } catch (err: any) {
      return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
    }
    const candidate = await prisma.candidate.findFirst({ where: { email: body.email } });
    if (!candidate) return NextResponse.json({ error: "candidate_not_found" }, { status: 404 });
    const student = await prisma.cohortStudent.upsert({
      where: { cohortId_candidateId: { cohortId: params.id, candidateId: candidate.id } },
      update: {},
      create: { cohortId: params.id, candidateId: candidate.id },
    });
    await writeAuditLog({
      action: "college.cohort.student.added",
      actorUserId: user.id,
      tenantId: scope.tenantId,
      targetType: "cohort_student",
      targetId: student.id,
      metadata: { cohort_id: params.id, candidate_id: candidate.id, email: body.email },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({ ok: true, student }, { status: 201 });
  } catch (err) {
    if (err instanceof CollegeAuthError) return NextResponse.json({ error: err.code }, { status: err.status });
    return authErrorResponse(err);
  }
}
