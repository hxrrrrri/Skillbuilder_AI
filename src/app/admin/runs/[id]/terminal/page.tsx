import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SandboxTerminal } from "@/components/sandbox-terminal";
import { ADMIN_NAV } from "../../../_nav";

export const dynamic = "force-dynamic";

export default async function AdminRunTerminalPage({ params }: { params: { id: string } }) {
  await requireAdminPage(`/admin/runs/${params.id}/terminal`);

  const run = await prisma.analysisRun.findUnique({
    where: { id: params.id },
    include: { repository: true, profiles: true, createdBy: true, candidate: true },
  });
  if (!run) notFound();

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
    outputSha256: e.outputSha256 ?? null,
    redactionWarning: !!e.redactionWarning,
  }));

  const profile = run.profiles[0];

  return (
    <RoleShell
      title={`Admin sandbox · ${run.repository.owner}/${run.repository.repoName}`}
      subtitle={`Run ${run.id} · owner ${run.createdBy?.email ?? "anonymous"}`}
      navLinks={ADMIN_NAV}
      activeHref="/admin/runs"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={run.status === "completed" ? "good" : run.status === "failed" ? "bad" : "warn"}>
          {run.status}
        </Badge>
        <Badge>{run.executionMode}</Badge>
        <Link href={`/admin/runs/${run.id}`} className="text-accent hover:underline">
          ← back to run trace
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
          initialIncludeTerminalProof={profile?.includeTerminalProof ?? false}
          canPublishToProfile={!!profile}
        />
      )}
    </RoleShell>
  );
}
