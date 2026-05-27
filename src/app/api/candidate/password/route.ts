import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  current_password: z.string().max(200).optional(),
  new_password: z.string().min(8).max(200),
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

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!dbUser) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const isInitialSet = !dbUser.passwordHash;
  if (!isInitialSet) {
    if (!body.current_password) {
      return NextResponse.json({ error: "current_password_required" }, { status: 400 });
    }
    const ok = await verifyPassword(body.current_password, dbUser.passwordHash);
    if (!ok) {
      await writeAuditLog({
        action: "candidate.password.failed",
        actorUserId: user.id,
        targetType: "user",
        targetId: user.id,
        metadata: { reason: "current_password_mismatch" },
      });
      return NextResponse.json({ error: "wrong_current_password" }, { status: 403 });
    }
  }

  const hash = await hashPassword(body.new_password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });

  await writeAuditLog({
    action: isInitialSet ? "candidate.password.set" : "candidate.password.changed",
    actorUserId: user.id,
    targetType: "user",
    targetId: user.id,
    metadata: { initial: isInitialSet },
  });

  return NextResponse.json({ ok: true });
}
