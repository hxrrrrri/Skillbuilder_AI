import { prisma } from "@/lib/db";

export type SkillDelta = { before: number | null; after: number | null };
export type Delta = Record<string, SkillDelta>;

export async function createSnapshotIfReVerify(newRunId: string): Promise<string | null> {
  const newRun = await prisma.analysisRun.findUnique({
    where: { id: newRunId },
    include: { repository: true, candidate: true },
  });
  if (!newRun || !newRun.candidateId) return null;

  const previous = await prisma.analysisRun.findFirst({
    where: {
      candidateId: newRun.candidateId,
      status: "completed",
      repository: { repoUrl: newRun.repository.repoUrl },
      id: { not: newRun.id },
    },
    orderBy: { completedAt: "desc" },
    include: { repository: true },
  });
  if (!previous) return null;

  const snapshot = await prisma.reVerificationSnapshot.create({
    data: {
      candidateId: newRun.candidateId,
      repoId: newRun.repoId,
      previousRunId: previous.id,
      nextRunId: newRun.id,
      previousScore: previous.overallScore ?? null,
    },
  });
  return snapshot.id;
}

export async function finalizeReVerificationForRun(runId: string): Promise<void> {
  const snapshot = await prisma.reVerificationSnapshot.findFirst({
    where: { nextRunId: runId, deltaJson: null },
  });
  if (!snapshot) return;

  const [prevScores, nextScores, nextRun] = await Promise.all([
    prisma.skillScore.findMany({ where: { runId: snapshot.previousRunId } }),
    prisma.skillScore.findMany({ where: { runId: runId } }),
    prisma.analysisRun.findUnique({ where: { id: runId }, select: { overallScore: true } }),
  ]);

  if (!nextRun || nextRun.overallScore == null) return;

  const prevMap = new Map(prevScores.map((s) => [s.skillName, s.score]));
  const nextMap = new Map(nextScores.map((s) => [s.skillName, s.score]));
  const skills = new Set<string>([...prevMap.keys(), ...nextMap.keys()]);
  const delta: Delta = {};
  for (const name of skills) {
    const b = prevMap.get(name);
    const a = nextMap.get(name);
    const before = b == null || b < 0 ? null : b;
    const after = a == null || a < 0 ? null : a;
    if (before !== after) delta[name] = { before, after };
  }

  await prisma.reVerificationSnapshot.update({
    where: { id: snapshot.id },
    data: {
      nextScore: nextRun.overallScore,
      deltaJson: JSON.stringify(delta),
    },
  });
}

export async function getCandidateTrajectory(candidateId: string) {
  return prisma.reVerificationSnapshot.findMany({
    where: { candidateId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}
