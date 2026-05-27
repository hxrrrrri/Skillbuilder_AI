import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().min(1).max(120).optional(),
  githubUsername: z
    .string()
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "github_username must be alphanumeric or dashes")
    .optional()
    .nullable(),
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

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.githubUsername !== undefined) {
    updates.githubUsername = body.githubUsername ? body.githubUsername.trim() : null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: updates,
    select: { id: true, name: true, githubUsername: true },
  });

  if (body.name !== undefined || body.githubUsername !== undefined) {
    const candidate = await prisma.candidate.findUnique({ where: { userId: user.id } });
    if (candidate) {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          ...(body.name !== undefined ? { name: updates.name as string } : {}),
          ...(body.githubUsername !== undefined ? { githubUsername: updates.githubUsername as string | null } : {}),
        },
      });
    }
  }

  await writeAuditLog({
    action: "candidate.settings.update",
    actorUserId: user.id,
    tenantId: user.primaryTenantId ?? null,
    targetType: "user",
    targetId: user.id,
    metadata: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ ok: true, user: updated });
}
