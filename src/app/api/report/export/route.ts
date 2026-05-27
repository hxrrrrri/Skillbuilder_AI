import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildMarkdownReport } from "@/lib/report";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { isAdminRole } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("run_id");
  if (!runId) return NextResponse.json({ error: "missing_run_id" }, { status: 400 });

  const run = await prisma.analysisRun.findUnique({
    where: { id: runId },
    include: {
      candidate: true,
      repository: true,
      scores: true,
      questions: true,
      profiles: { where: { visibility: "public" }, take: 1 },
    },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sessionUser = await getCurrentUser();
  const isPubliclyPublished = run.profiles.length > 0;
  const isOwner =
    !!sessionUser &&
    (run.createdByUserId === sessionUser.id ||
      (run.candidate?.userId && run.candidate.userId === sessionUser.id));
  const isAnonymousRun = !run.createdByUserId && !run.candidate?.userId;
  const allowedByRole = sessionUser && isAdminRole(sessionUser.role);

  if (!isPubliclyPublished && !isOwner && !isAnonymousRun && !allowedByRole) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const md = buildMarkdownReport(run as any);
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
