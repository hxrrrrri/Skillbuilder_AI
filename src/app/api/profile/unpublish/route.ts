import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { evaluateRunMutationAccess } from "@/lib/auth/guards-api";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/auth/audit";
import { revalidatePublicProfile } from "@/lib/profile-cache";

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
    include: { run: { select: { tenantId: true, candidateId: true, createdByUserId: true, candidate: { select: { userId: true } } } } },
  });
  if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const decision = evaluateRunMutationAccess(user, {
    candidateId: profile.run.candidateId,
    createdByUserId: profile.run.createdByUserId,
    tenantId: profile.run.tenantId,
    candidateUserId: profile.run.candidate?.userId ?? null,
  }, "unpublish_profile");
  if (!decision.ok || (decision.reason !== "admin" && profile.ownerUserId !== user.id)) {
    return !decision.ok ? decision.response : NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const updated = await prisma.publicProfile.update({
    where: { id: profile.id },
    data: { visibility: body.visibility },
  });

  // Visibility just changed (e.g. → private): bust the cached public read now
  // so the change takes effect immediately, not after the revalidate window.
  revalidatePublicProfile(updated.slug);

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
