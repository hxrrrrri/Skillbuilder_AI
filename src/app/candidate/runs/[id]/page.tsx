import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { evaluateRunAccess } from "@/lib/auth/guards-api";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { RoleShell } from "@/components/role-shell";
import { CANDIDATE_NAV } from "../../_nav";
import { RunCommandCenter } from "./run-command-center";

export const dynamic = "force-dynamic";

export default async function CandidateRunDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/candidate/runs/${params.id}`);

  const run = await prisma.analysisRun.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      candidateId: true,
      createdByUserId: true,
      tenantId: true,
      targetRole: true,
      repository: { select: { owner: true, repoName: true } },
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
  if (!decision.ok || decision.reason === "tenant_member") {
    if (isAdminRole(user.role)) redirect(`/admin/runs/${run.id}`);
    notFound();
  }

  return (
    <RoleShell
      title={`${run.repository.owner}/${run.repository.repoName}`}
      subtitle="Live proof command center. Evidence appears as each provider-backed agent completes."
      navLinks={CANDIDATE_NAV}
      activeHref="/candidate/runs"
    >
      <RunCommandCenter runId={run.id} />
    </RoleShell>
  );
}
