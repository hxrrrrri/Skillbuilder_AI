import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildMarkdownReport } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("run_id");
  if (!runId) return NextResponse.json({ error: "missing_run_id" }, { status: 400 });

  const run = await prisma.analysisRun.findUnique({
    where: { id: runId },
    include: { candidate: true, repository: true, scores: true, questions: true },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const md = buildMarkdownReport(run as any);
  const filename = `SkillProof-${run.repository.owner}-${run.repository.repoName}.md`;
  return new NextResponse(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
