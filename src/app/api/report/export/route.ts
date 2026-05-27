import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildMarkdownReport } from "@/lib/report";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { isAdminRole, isCollegeRole } from "@/lib/auth/roles";
import { evaluateRunAccess } from "@/lib/auth/guards-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("run_id");
  const profileId = url.searchParams.get("profile_id");
  if (!runId && !profileId) return NextResponse.json({ error: "missing_run_id" }, { status: 400 });

  const sessionUser = await getCurrentUser();
  let profile: { id: string; visibility: string; ownerUserId: string | null; includeTerminalProof: boolean } | null = null;
  let resolvedRunId = runId;
  if (profileId) {
    const row = await prisma.publicProfile.findUnique({
      where: { id: profileId },
      select: { id: true, runId: true, visibility: true, ownerUserId: true, includeTerminalProof: true },
    });
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    profile = row;
    resolvedRunId = row.runId;
  }

  const run = await prisma.analysisRun.findUnique({
    where: { id: resolvedRunId! },
    include: {
      candidate: true,
      repository: true,
      scores: true,
      questions: true,
      profiles: { where: { visibility: { in: ["public", "unlisted"] } }, take: 1 },
    },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const publicProfile = profile ?? run.profiles[0] ?? null;
  const isPubliclyPublished = !!publicProfile && publicProfile.visibility !== "private";
  const isOwner =
    !!sessionUser &&
    (run.createdByUserId === sessionUser.id ||
      (run.candidate?.userId && run.candidate.userId === sessionUser.id) ||
      publicProfile?.ownerUserId === sessionUser.id);
  const allowedByRole = sessionUser && isAdminRole(sessionUser.role);
  const collegeDecision =
    sessionUser && isCollegeRole(sessionUser.role)
      ? evaluateRunAccess(sessionUser, {
          candidateId: run.candidateId,
          createdByUserId: run.createdByUserId,
          tenantId: run.tenantId,
          candidateUserId: run.candidate?.userId ?? null,
        })
      : null;
  const allowedByCollege = !!collegeDecision?.ok;

  if (!isPubliclyPublished && !isOwner && !allowedByRole && !allowedByCollege) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const publicView = !isOwner && !allowedByRole;
  const md = buildMarkdownReport(run as any, {
    publicView,
    includeTerminalProof: publicView ? !!publicProfile?.includeTerminalProof : true,
  });
  const filename = `SkillProof-${run.repository.owner}-${run.repository.repoName}.md`;

  await writeAuditLog({
    action: "report.export",
    actorUserId: sessionUser?.id ?? null,
    tenantId: run.tenantId ?? null,
    targetType: "run",
    targetId: run.id,
    metadata: { repo: `${run.repository.owner}/${run.repository.repoName}` },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return new NextResponse(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
