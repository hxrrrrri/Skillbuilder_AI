import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, HttpAuthError, authErrorResponse } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  visibility: z.enum(["public", "unlisted", "private"]),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new HttpAuthError(401, "unauthenticated");
    if (!isAdminRole(user.role)) throw new HttpAuthError(403, "forbidden");

    let body: z.infer<typeof Body>;
    try {
      body = Body.parse(await req.json());
    } catch (err: any) {
      return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
    }

    const existing = await prisma.publicProfile.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const profile = await prisma.publicProfile.update({
      where: { id: params.id },
      data: { visibility: body.visibility },
    });

    await writeAuditLog({
      action: "admin.profile.visibility",
      actorUserId: user.id,
      tenantId: null,
      targetType: "profile",
      targetId: profile.id,
      metadata: {
        previous: existing.visibility,
        next: body.visibility,
        slug: profile.slug,
      },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({ ok: true, profile: { id: profile.id, slug: profile.slug, visibility: profile.visibility } });
  } catch (err) {
    return authErrorResponse(err);
  }
}
