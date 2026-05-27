import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { evaluateRunAccess } from "@/lib/auth/guards-api";
import { isAdminRole, isCollegeRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function MissionRedirectPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/mission/${params.id}`)}`);

  const run = await prisma.analysisRun.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      candidateId: true,
      createdByUserId: true,
      tenantId: true,
      candidate: { select: { userId: true } },
    },
  });
  if (!run) notFound();

  const decision = evaluateRunAccess(user, {
    candidateId: run.candidateId,
    createdByUserId: run.createdByUserId,
    tenantId: run.tenantId,
    candidateUserId: run.candidate?.userId ?? null,
  });

  if (!decision.ok) redirect(`${isCollegeRole(user.role) ? "/college/dashboard" : "/post-login"}?forbidden=1`);
  if (isAdminRole(user.role)) redirect(`/admin/runs/${run.id}`);
  if (isCollegeRole(user.role)) {
    redirect(run.candidateId ? `/college/students/${run.candidateId}` : "/college/students");
  }
  if (user.role === "candidate") redirect(`/candidate/runs/${run.id}`);

  redirect("/post-login?forbidden=1");
}
