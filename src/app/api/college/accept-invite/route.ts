import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { writeAuditLog } from "@/lib/auth/audit";
import { prisma } from "@/lib/db";
import { AcceptInviteBody } from "@/lib/college/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body;
  try {
    body = AcceptInviteBody.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }
  const invite = await prisma.tenantInvite.findUnique({ where: { token: body.token }, include: { tenant: true } });
  if (!invite) return NextResponse.json({ error: "invite_not_found" }, { status: 404 });
  if (invite.acceptedAt) return NextResponse.json({ error: "invite_already_accepted" }, { status: 409 });
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: "invite_expired" }, { status: 410 });

  const sessionUser = await getCurrentUser();
  if (!sessionUser && (!body.password || !body.name)) {
    return NextResponse.json({ error: "registration_required" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    let user = sessionUser
      ? await tx.user.findUnique({ where: { id: sessionUser.id } })
      : await tx.user.findUnique({ where: { email: invite.email } });
    if (!user) {
      user = await tx.user.create({
        data: {
          email: invite.email,
          name: body.name!,
          passwordHash: await hashPassword(body.password!),
          role: invite.role === "candidate" ? "candidate" : "college_member",
          primaryTenantId: invite.tenantId,
          githubUsername: body.github_username ?? null,
        },
      });
    }
    await tx.tenantMembership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: invite.tenantId } },
      update: { role: invite.role === "mentor" ? "mentor" : invite.role === "candidate" ? "member" : "member" },
      create: { userId: user.id, tenantId: invite.tenantId, role: invite.role === "mentor" ? "mentor" : "member" },
    });
    if (!user.primaryTenantId) {
      await tx.user.update({ where: { id: user.id }, data: { primaryTenantId: invite.tenantId } });
    }
    let candidate = null;
    if (invite.role === "candidate") {
      candidate = await tx.candidate.upsert({
        where: { userId: user.id },
        update: {
          name: user.name,
          email: user.email,
          githubUsername: body.github_username ?? user.githubUsername,
        },
        create: {
          userId: user.id,
          name: user.name,
          email: user.email,
          githubUsername: body.github_username ?? user.githubUsername,
        },
      });
      if (invite.cohortId) {
        await tx.cohortStudent.upsert({
          where: { cohortId_candidateId: { cohortId: invite.cohortId, candidateId: candidate.id } },
          update: {},
          create: { cohortId: invite.cohortId, candidateId: candidate.id },
        });
      }
    }
    const accepted = await tx.tenantInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedByUserId: user.id },
    });
    return { user, candidate, accepted };
  });

  await writeAuditLog({
    action: "college.invite.accepted",
    actorUserId: result.user.id,
    tenantId: invite.tenantId,
    targetType: "tenant_invite",
    targetId: invite.id,
    metadata: { email: invite.email, role: invite.role, cohort_id: invite.cohortId },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ ok: true, user_id: result.user.id, candidate_id: result.candidate?.id ?? null });
}
