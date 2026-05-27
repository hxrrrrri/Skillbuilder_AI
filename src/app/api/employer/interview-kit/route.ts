import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auth/audit";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { InterviewKitRequest, generateInterviewKit, getEmployerProfileBundle } from "@/lib/employer/profiles";
import type { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireRole("employer");
    let body: z.infer<typeof InterviewKitRequest>;
    try {
      body = InterviewKitRequest.parse(await req.json());
    } catch (err: any) {
      return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
    }

    const bundle = await getEmployerProfileBundle(body.profile_id);
    if (!bundle) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });

    const kit = await generateInterviewKit(bundle, {
      targetRole: body.target_role,
      focus: body.focus,
    });
    await prisma.publicProfile.update({
      where: { id: bundle.id },
      data: { interviewKit: JSON.stringify(kit) },
    });
    await writeAuditLog({
      action: "employer.interview_kit.generated",
      actorUserId: user.id,
      tenantId: user.primaryTenantId,
      targetType: "profile",
      targetId: bundle.id,
      metadata: {
        target_role: kit.target_role,
        source: kit.source,
        model: kit.model,
        focus: body.focus ?? [],
      },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({ ok: true, kit });
  } catch (err) {
    return authErrorResponse(err);
  }
}
