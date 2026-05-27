import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  profile_id: z.string().min(1),
  visibility: z.enum(["public", "unlisted", "private"]).default("private"),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const profile = await prisma.publicProfile.findUnique({
    where: { id: body.profile_id },
    include: { run: { select: { tenantId: true } } },
  });
  if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isAdminRole(user.role) && profile.ownerUserId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const updated = await prisma.publicProfile.update({
    where: { id: profile.id },
    data: { visibility: body.visibility },
  });

  await writeAuditLog({
    action: "profile.unpublish",
    actorUserId: user.id,
    tenantId: profile.run.tenantId ?? null,
    targetType: "profile",
    targetId: profile.id,
    metadata: { previous: profile.visibility, next: updated.visibility, slug: updated.slug },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ ok: true, profile: { id: updated.id, slug: updated.slug, visibility: updated.visibility } });
}
