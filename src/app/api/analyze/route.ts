import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseRepoUrl } from "@/lib/utils";
import { preCreateEvents, runMission } from "@/agents/mission-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  repo_url: z.string().url(),
  candidate_name: z.string().min(1).max(80).default("Anonymous Candidate"),
  github_username: z.string().min(1).max(80).optional(),
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

  const candidate = await prisma.candidate.create({
    data: {
      name: body.candidate_name,
      githubUsername: body.github_username ?? null,
    },
  });

  const repository = await prisma.repository.create({
    data: {
      candidateId: candidate.id,
      repoUrl: body.repo_url,
      repoName: parsed.repo,
      owner: parsed.owner,
    },
  });

  const run = await prisma.analysisRun.create({
    data: {
      candidateId: candidate.id,
      repoId: repository.id,
      targetRole: body.target_role,
      candidateLevel: body.candidate_level,
      jobDescription: body.job_description,
      status: "pending",
    },
  });

  await preCreateEvents(run.id);

  // Local in-process runner. For serverless deploys, swap this for a queue.
  runMission({
    runId: run.id,
    owner: parsed.owner,
    repo: parsed.repo,
    targetRole: body.target_role,
    candidateLevel: body.candidate_level,
    candidateName: body.candidate_name,
    githubUsername: body.github_username,
    jobDescription: body.job_description,
  }).catch(async (err) => {
    console.error("[mission] failed", err);
    await prisma.analysisRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        statusMessage: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
  });

  return NextResponse.json({ run_id: run.id, candidate_id: candidate.id }, { status: 202 });
}
