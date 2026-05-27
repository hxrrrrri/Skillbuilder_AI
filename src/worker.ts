import { prisma } from "./lib/db";
import { runMission } from "./agents/mission-runner";

const POLL_MS = Number(process.env.SKILLPROOF_WORKER_POLL_MS ?? 3000);

async function claimNextRun() {
  const run = await prisma.analysisRun.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { repository: true, candidate: true },
  });
  if (!run) return null;
  const claimed = await prisma.analysisRun.updateMany({
    where: { id: run.id, status: "pending" },
    data: { status: "running", statusMessage: "Claimed by worker." },
  });
  if (claimed.count === 0) return null;
  return run;
}

async function processOne() {
  const run = await claimNextRun();
  if (!run) return false;
  try {
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
    });
  } catch (err) {
    await prisma.analysisRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        statusMessage: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
  }
  return true;
}

async function main() {
  console.log(`[worker] SkillProof worker started. poll=${POLL_MS}ms`);
  while (true) {
    const worked = await processOne();
    if (!worked) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
