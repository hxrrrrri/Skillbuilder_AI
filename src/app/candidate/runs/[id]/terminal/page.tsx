import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SandboxTerminal } from "@/components/sandbox-terminal";
import { CANDIDATE_NAV } from "../../../_nav";

export const dynamic = "force-dynamic";

export default async function CandidateRunTerminalPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/candidate/runs/${params.id}/terminal`);

  const run = await prisma.analysisRun.findUnique({
    where: { id: params.id },
    include: { repository: true, candidate: true, profiles: true },
  });
  if (!run) notFound();

  const ownerId = run.createdByUserId ?? run.candidate?.userId ?? null;
  const isOwner = !!ownerId && ownerId === user.id;
  if (!isOwner && !isAdminRole(user.role)) {
    return (
      <RoleShell
        title="Sandbox terminal"
        subtitle="Per-run command sandbox with auditable proof transcript."
        navLinks={CANDIDATE_NAV}
        activeHref="/candidate/runs"
      >
        <Card>
          <CardBody>
            <ScaffoldNotice
              title="Not authorized"
              detail="Only the run owner or an admin can execute commands against this run's workspace."
            />
          </CardBody>
        </Card>
      </RoleShell>
    );
  }

  const terminalDisabled =
    process.env.NODE_ENV === "production" && process.env.SKILLPROOF_TERMINAL_ENABLED !== "1";

  const existingEvidence = safeJsonParse<any[]>(run.terminalEvidence, []).map((e) => ({
    command: String(e.command ?? ""),
    cwd: String(e.cwd ?? ""),
    exitCode: typeof e.exitCode === "number" ? e.exitCode : null,
    durationMs: Number(e.durationMs ?? 0),
    stdoutSummary: String(e.stdoutSummary ?? ""),
    stderrSummary: String(e.stderrSummary ?? ""),
    usedFor: (e.usedFor as any) ?? "agent",
  }));

  const profile = run.profiles[0];
  const includeTerminalProof = profile?.includeTerminalProof ?? false;

  return (
    <RoleShell
      title={`Sandbox terminal · ${run.repository.owner}/${run.repository.repoName}`}
      subtitle="Allowlisted commands, jailed cwd, redacted output. Each command is audited."
      navLinks={CANDIDATE_NAV}
      activeHref="/candidate/runs"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={run.status === "completed" ? "good" : run.status === "failed" ? "bad" : "warn"}>
          {run.status}
        </Badge>
        <Badge>{run.executionMode}</Badge>
        <Link
          href={`/mission/${run.id}`}
          className="text-accent hover:underline"
        >
          ← back to mission
        </Link>
      </div>

      {terminalDisabled ? (
        <Card>
          <CardHeader>
            <CardTitle>Terminal disabled</CardTitle>
          </CardHeader>
          <CardBody>
            <ScaffoldNotice
              title="Terminal disabled in production"
              detail="Set SKILLPROOF_TERMINAL_ENABLED=1 on the server to enable per-run sandbox commands."
            />
          </CardBody>
        </Card>
      ) : (
        <SandboxTerminal
          runId={run.id}
          initialEvidence={existingEvidence}
          initialIncludeTerminalProof={includeTerminalProof}
          canPublishToProfile={!!profile}
        />
      )}
    </RoleShell>
  );
}
