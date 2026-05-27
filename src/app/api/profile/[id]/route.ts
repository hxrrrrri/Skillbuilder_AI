import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  visibility: z.enum(["public", "unlisted", "private"]).optional(),
  includeTerminalProof: z.boolean().optional(),
});

async function loadProfile(id: string) {
  return prisma.publicProfile.findUnique({
    where: { id },
    include: { run: { select: { tenantId: true } } },
  });
}

function canMutate(user: { id: string; role: string }, profile: { ownerUserId: string | null }): boolean {
  if (isAdminRole(user.role as any)) return true;
  return !!profile.ownerUserId && profile.ownerUserId === user.id;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }
  const profile = await loadProfile(params.id);
  if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canMutate(user, profile)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const data: Record<string, unknown> = {};
  if (body.visibility !== undefined) data.visibility = body.visibility;
  if (body.includeTerminalProof !== undefined) data.includeTerminalProof = body.includeTerminalProof;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  const updated = await prisma.publicProfile.update({ where: { id: params.id }, data });

  await writeAuditLog({
    action: "profile.update",
    actorUserId: user.id,
    tenantId: profile.run.tenantId ?? null,
    targetType: "profile",
    targetId: profile.id,
    metadata: { changes: data },
  });

  return NextResponse.json({ ok: true, profile: { id: updated.id, visibility: updated.visibility, includeTerminalProof: updated.includeTerminalProof } });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const profile = await loadProfile(params.id);
  if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canMutate(user, profile)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.publicProfile.delete({ where: { id: params.id } });
  await writeAuditLog({
    action: "profile.unpublish",
    actorUserId: user.id,
    tenantId: profile.run.tenantId ?? null,
    targetType: "profile",
    targetId: profile.id,
    metadata: { slug: profile.slug },
  });
  return NextResponse.json({ ok: true });
}
