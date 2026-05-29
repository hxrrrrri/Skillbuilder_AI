import { randomUUID } from "node:crypto";
import { prisma } from "./lib/db";
import { runMission } from "./agents/mission-runner";

const POLL_MS = Number(process.env.SKILLPROOF_WORKER_POLL_MS ?? 3000);
const HEARTBEAT_MS = Number(process.env.SKILLPROOF_WORKER_HEARTBEAT_MS ?? 10_000);
const STUCK_AFTER_MS = Number(process.env.SKILLPROOF_WORKER_STUCK_AFTER_MS ?? 5 * 60_000);

function nowMinus(ms: number) {
  return new Date(Date.now() - ms);
}

function defaultWorkerId() {
  return process.env.SKILLPROOF_WORKER_ID || `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
}

type ClaimedRun = Awaited<ReturnType<typeof prisma.analysisRun.findFirst>>;

const analysisRun = prisma.analysisRun as any;

export async function recoverStuckRuns() {
  return analysisRun.updateMany({
    where: {
      status: "in_progress",
      heartbeatAt: { lt: nowMinus(STUCK_AFTER_MS) },
    },
    data: {
      status: "pending",
      statusMessage: "Recovered stale worker claim; queued for retry.",
      workerId: null,
      heartbeatAt: null,
    },
  });
}

export async function claimNextRun(workerId = defaultWorkerId()) {
  await recoverStuckRuns();
  const run = await analysisRun.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { repository: true, candidate: true },
  });
  if (!run) return null;

  const attemptCount = Number((run as any).attemptCount ?? 0);
  const maxAttempts = Number((run as any).maxAttempts ?? 1);
  if (attemptCount >= maxAttempts) {
    await analysisRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        statusMessage: `Max attempts reached (${attemptCount}/${maxAttempts}).`,
        lastFailureReason: "max_attempts_reached",
      },
    });
    return null;
  }

  const claimed = await analysisRun.updateMany({
    where: { id: run.id, status: "pending" },
    data: {
      status: "in_progress",
      statusMessage: `Claimed by worker ${workerId}.`,
      workerId,
      heartbeatAt: new Date(),
      attemptCount: { increment: 1 },
      lastFailureReason: null,
    },
  });
  if (claimed.count === 0) return null;
  return run;
}

async function heartbeat(runId: string, workerId: string) {
  await analysisRun.updateMany({
    where: { id: runId, workerId, status: { in: ["in_progress", "running"] } },
    data: { heartbeatAt: new Date() },
  });
}

export async function processOne(workerId = defaultWorkerId()) {
  const run = await claimNextRun(workerId);
  if (!run) return false;
  const beat = setInterval(() => {
    heartbeat(run.id, workerId).catch((err) => console.error("[worker] heartbeat failed", err));
  }, HEARTBEAT_MS);
  const ownershipChallenge = await prisma.ownershipChallenge.findFirst({
    where: { runId: run.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, tokenHash: true },
  });
  try {
    await heartbeat(run.id, workerId);
    await runMission({
      runId: run.id,
      owner: run.repository.owner,
      repo: run.repository.repoName,
      repoUrl: run.repository.repoUrl,
      targetRole: run.targetRole,
      candidateLevel: run.candidateLevel ?? "Junior",
      candidateName: run.candidate?.name,
      githubUsername: run.candidate?.githubUsername ?? undefined,
      jobDescription: run.jobDescription ?? undefined,
      executionMode: run.executionMode as any,
      localInstallApproved: run.localInstallApproved,
      ownershipTokenHash: ownershipChallenge?.tokenHash ?? null,
      ownershipChallengeId: ownershipChallenge?.id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attemptCount = Number((run as any).attemptCount ?? 0) + 1;
    const maxAttempts = Number((run as any).maxAttempts ?? 1);
    await analysisRun.update({
      where: { id: run.id },
      data: {
        status: attemptCount < maxAttempts ? "pending" : "failed",
        statusMessage: attemptCount < maxAttempts
          ? `Worker ${workerId} failed attempt ${attemptCount}/${maxAttempts}; queued for retry.`
          : message,
        lastFailureReason: message,
        workerId,
        heartbeatAt: new Date(),
      },
    });
  } finally {
    clearInterval(beat);
  }
  return true;
}

export async function main() {
  const workerId = defaultWorkerId();
  let stopping = false;
  const stop = () => {
    stopping = true;
    console.log(`[worker] ${workerId} graceful shutdown requested`);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log(`[worker] SkillProof worker started. id=${workerId} poll=${POLL_MS}ms`);
  while (!stopping) {
    const worked = await processOne(workerId);
    if (!worked) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  console.log(`[worker] ${workerId} stopped`);
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error("[worker] fatal", err);
    process.exit(1);
  });
}
