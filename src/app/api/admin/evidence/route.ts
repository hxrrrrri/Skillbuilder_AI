import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import { safeJsonParse } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EvidenceItem = {
  reason?: string;
  source?: string;
  file?: string;
  line?: number | null;
  line_start?: number | null;
  line_end?: number | null;
  snippet?: string;
  validator_note?: string | null;
};

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;

  const url = new URL(req.url);
  const skill = url.searchParams.get("skill")?.trim().toLowerCase() || null;
  const source = url.searchParams.get("source")?.trim().toLowerCase() || null;
  const runId = url.searchParams.get("run_id")?.trim() || null;
  const q = url.searchParams.get("q")?.trim().toLowerCase() || null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 500);

  const where: any = {};
  if (skill) where.skillName = { contains: skill };
  if (runId) where.runId = runId;

  const scores = await prisma.skillScore.findMany({
    where,
    take: limit,
    orderBy: { id: "desc" },
    include: {
      run: { select: { id: true, candidateId: true, repoId: true, repository: { select: { owner: true, repoName: true } } } },
    },
  });

  const rows: Array<{
    scoreId: string;
    runId: string;
    skill: string;
    score: number;
    scoreSource: string;
    repo: string;
    item: EvidenceItem;
  }> = [];

  for (const s of scores) {
    const items = safeJsonParse<EvidenceItem[]>(s.evidence, []);
    for (const item of items) {
      if (source && (item.source ?? "").toLowerCase() !== source) continue;
      if (q) {
        const hay = `${item.reason ?? ""} ${item.file ?? ""} ${item.snippet ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      rows.push({
        scoreId: s.id,
        runId: s.runId,
        skill: s.skillName,
        score: s.score,
        scoreSource: s.scoreSource,
        repo: `${s.run.repository.owner}/${s.run.repository.repoName}`,
        item,
      });
    }
  }

  return NextResponse.json({
    total: rows.length,
    limitedTo: limit,
    rows: rows.slice(0, limit),
  });
}
