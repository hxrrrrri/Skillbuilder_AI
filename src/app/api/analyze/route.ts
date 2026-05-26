import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseRepoUrl } from "@/lib/utils";
import { preCreateEvents, runMission } from "@/agents/mission-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  repo_url: z.string().url(),
  target_role: z.string().min(2).max(80),
  candidate_level: z.string().min(2).max(40).default("Junior"),
  job_description: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message ?? "bad input" }, { status: 400 });
  }

  const parsed = parseRepoUrl(body.repo_url);
  if (!parsed) {
    return NextResponse.json({ error: "invalid_repo_url" }, { status: 400 });
  }

  const repository = await prisma.repository.create({
    data: {
      repoUrl: body.repo_url,
      repoName: parsed.repo,
      owner: parsed.owner,
    },
  });

  const run = await prisma.analysisRun.create({
    data: {
      repoId: repository.id,
      targetRole: body.target_role,
      candidateLevel: body.candidate_level,
      jobDescription: body.job_description,
      status: "pending",
    },
  });

  await preCreateEvents(run.id);

  // Kick off mission asynchronously. We do NOT await; the UI polls the run.
  runMission({
    runId: run.id,
    owner: parsed.owner,
    repo: parsed.repo,
    targetRole: body.target_role,
    candidateLevel: body.candidate_level,
    jobDescription: body.job_description,
  }).catch((err) => {
    console.error("[mission] failed", err);
  });

  return NextResponse.json({ run_id: run.id }, { status: 202 });
}
