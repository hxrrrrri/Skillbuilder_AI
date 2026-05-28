import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseRepoUrl } from "@/lib/utils";
import { preCreateEvents, runMission } from "@/agents/mission-runner";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/auth/audit";
import { createSnapshotIfReVerify } from "@/lib/reverification";
import { checkProviderReadinessForMode } from "@/lib/providers/provider-router";
import { verifyOwnershipChallengeToken } from "@/lib/ownership-challenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  repo_url: z.string().url(),
  candidate_name: z.string().min(1).max(80).default("Anonymous Candidate"),
  github_username: z.string().min(1).max(80).optional(),
  target_role: z.string().min(2).max(80),
  candidate_level: z.string().min(2).max(40).default("Junior"),
  job_description: z.string().max(4000).optional(),
  execution_mode: z.enum(["api", "cli", "hybrid", "local"]).default("api"),
  local_install_approved: z.boolean().default(false),
  ownership_token: z.string().min(8).max(512).optional(),
  ownership_challenge_id: z.string().optional(),
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

  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Only candidates and admins may start a run. Disallow employers/college members
  // from initiating runs on behalf of others via the API to reduce abuse.
  if (!isAdminRole(sessionUser.role) && sessionUser.role !== "candidate") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const readiness = await checkProviderReadinessForMode(body.execution_mode);
  if (!readiness.ok) {
    return NextResponse.json(
      {
        error: "provider_not_ready",
        message: "Verification cannot start until every required real provider has passed health checks.",
        mode: body.execution_mode,
        blockers: readiness.blockers,
      },
      { status: 409 },
    );
  }

  let ownershipChallenge: {
    id: string;
    userId: string;
    repoOwner: string;
    repoName: string;
    tokenHash: string;
    expiresAt: Date;
    consumedAt: Date | null;
  } | null = null;
  if (body.ownership_challenge_id || body.ownership_token) {
    if (!body.ownership_challenge_id || !body.ownership_token) {
      return NextResponse.json(
        { error: "invalid_ownership_challenge", message: "Ownership challenge ID and token must be submitted together." },
        { status: 400 },
      );
    }
    const verified = verifyOwnershipChallengeToken(body.ownership_token);
    if (!verified.ok) {
      return NextResponse.json({ error: "invalid_ownership_challenge", reason: verified.reason }, { status: 400 });
    }
    if (
      verified.payload.challengeId !== body.ownership_challenge_id ||
      verified.payload.userId !== sessionUser.id ||
      verified.payload.owner.toLowerCase() !== parsed.owner.toLowerCase() ||
      verified.payload.repo.toLowerCase() !== parsed.repo.toLowerCase()
    ) {
      return NextResponse.json({ error: "invalid_ownership_challenge", reason: "challenge_payload_mismatch" }, { status: 400 });
    }
    ownershipChallenge = await prisma.ownershipChallenge.findUnique({
      where: { id: body.ownership_challenge_id },
      select: { id: true, userId: true, repoOwner: true, repoName: true, tokenHash: true, expiresAt: true, consumedAt: true },
    });
    if (
      !ownershipChallenge ||
      ownershipChallenge.userId !== sessionUser.id ||
      ownershipChallenge.repoOwner.toLowerCase() !== parsed.owner.toLowerCase() ||
      ownershipChallenge.repoName.toLowerCase() !== parsed.repo.toLowerCase() ||
      ownershipChallenge.tokenHash !== verified.tokenHash
    ) {
      return NextResponse.json({ error: "invalid_ownership_challenge", reason: "challenge_not_found" }, { status: 400 });
    }
    if (ownershipChallenge.expiresAt.getTime() <= Date.now()) {
      await prisma.ownershipChallenge.update({ where: { id: ownershipChallenge.id }, data: { status: "expired" } }).catch(() => {});
      return NextResponse.json({ error: "invalid_ownership_challenge", reason: "expired" }, { status: 400 });
    }
    if (ownershipChallenge.consumedAt) {
      return NextResponse.json({ error: "invalid_ownership_challenge", reason: "already_consumed" }, { status: 400 });
    }
  }

  // If the signed-in user is a candidate, reuse their Candidate row; otherwise create anonymous.
  let candidate;
  if (sessionUser.role === "candidate") {
    candidate = await prisma.candidate.upsert({
      where: { userId: sessionUser.id },
      update: {
        name: body.candidate_name,
        githubUsername: body.github_username ?? undefined,
      },
      create: {
        userId: sessionUser.id,
        name: body.candidate_name,
        email: sessionUser.email,
        githubUsername: body.github_username ?? null,
      },
    });
  } else {
    candidate = await prisma.candidate.create({
      data: {
        name: body.candidate_name,
        githubUsername: body.github_username ?? null,
      },
    });
  }

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
      createdByUserId: sessionUser.id,
      tenantId: sessionUser.primaryTenantId ?? null,
      repoId: repository.id,
      targetRole: body.target_role,
      candidateLevel: body.candidate_level,
      jobDescription: body.job_description,
      status: "pending",
      statusMessage:
        process.env.SKILLPROOF_WORKER_MODE === "1" || process.env.NODE_ENV === "production"
          ? "Queued for out-of-process worker."
          : "Queued for local in-process fallback. Set SKILLPROOF_WORKER_MODE=1 and run `npm run worker` for demo/production.",
      executionMode: body.execution_mode,
      localInstallApproved: body.local_install_approved,
    },
  });

  if (ownershipChallenge) {
    await prisma.ownershipChallenge.update({
      where: { id: ownershipChallenge.id },
      data: { runId: run.id, status: "linked" },
    });
  }

  await writeAuditLog({
    action: "run.started",
    actorUserId: sessionUser.id,
    tenantId: sessionUser.primaryTenantId ?? null,
    targetType: "run",
    targetId: run.id,
    metadata: {
      repo: `${parsed.owner}/${parsed.repo}`,
      target_role: body.target_role,
      execution_mode: body.execution_mode,
      ownership_token: body.ownership_token ? "supplied" : "not_supplied",
      ownership_challenge_id: ownershipChallenge?.id ?? null,
    },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  await preCreateEvents(run.id);
  await createSnapshotIfReVerify(run.id);

  // Recommended demo/production path: set SKILLPROOF_WORKER_MODE=1 and run
  // `npm run worker` to process pending missions out-of-process. In-process
  // remains available only as a local fallback.
  const useWorker = process.env.SKILLPROOF_WORKER_MODE === "1" || process.env.NODE_ENV === "production";
  if (!useWorker) {
    runMission({
      runId: run.id,
      owner: parsed.owner,
      repo: parsed.repo,
      repoUrl: body.repo_url,
      targetRole: body.target_role,
      candidateLevel: body.candidate_level,
      candidateName: body.candidate_name,
      githubUsername: body.github_username,
      jobDescription: body.job_description,
      executionMode: body.execution_mode,
      localInstallApproved: body.local_install_approved,
      ownershipToken: body.ownership_token,
      ownershipTokenHash: ownershipChallenge?.tokenHash ?? null,
      ownershipChallengeId: ownershipChallenge?.id ?? null,
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
  }

  return NextResponse.json({ run_id: run.id, candidate_id: candidate.id, worker_mode: useWorker ? "worker" : "in_process" }, { status: 202 });
}
