import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { verifyPassword } from "@/lib/auth/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  password: z.string().min(1).max(200),
  confirm: z.literal("DELETE"),
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

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, email: true },
  });
  if (!dbUser) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const ok = await verifyPassword(body.password, dbUser.passwordHash);
  if (!ok) {
    await writeAuditLog({
      action: "candidate.delete.failed",
      actorUserId: user.id,
      targetType: "user",
      targetId: user.id,
      metadata: { reason: "password_mismatch" },
    });
    return NextResponse.json({ error: "wrong_password" }, { status: 403 });
  }

  await prisma.publicProfile.updateMany({ where: { ownerUserId: user.id }, data: { visibility: "private" } });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      status: "deleted",
      email: `deleted-${user.id}@skillproof.invalid`,
      passwordHash: "deleted",
      name: "Deleted user",
      githubUsername: null,
      image: null,
    },
  });

  await writeAuditLog({
    action: "user.deleted",
    actorUserId: user.id,
    targetType: "user",
    targetId: user.id,
    metadata: { previous_email: dbUser.email },
  });

  return NextResponse.json({ ok: true });
}
