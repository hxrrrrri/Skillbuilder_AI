import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  run_id: z.string().min(1),
  include: z.boolean(),
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

  const run = await prisma.analysisRun.findUnique({
    where: { id: body.run_id },
    select: {
      id: true,
      tenantId: true,
      createdByUserId: true,
      candidate: { select: { userId: true } },
    },
  });
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });

  const ownerId = run.createdByUserId ?? run.candidate?.userId ?? null;
  const isOwner = !!ownerId && ownerId === user.id;
  const isAdmin = isAdminRole(user.role);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const updated = await prisma.publicProfile.updateMany({
    where: {
      runId: body.run_id,
      ...(isAdmin ? {} : { ownerUserId: user.id }),
    },
    data: { includeTerminalProof: body.include },
  });

  await writeAuditLog({
    action: "terminal.publish_transcript",
    actorUserId: user.id,
    tenantId: run.tenantId ?? null,
    targetType: "run",
    targetId: run.id,
    metadata: { include: body.include, profilesUpdated: updated.count },
  });

  return NextResponse.json({ ok: true, profilesUpdated: updated.count });
}
