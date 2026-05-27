import { prisma } from "@/lib/db";
import type { RepoContextPack } from "@/agents/types";
import { sha256Json } from "./evidence-contracts";
import { EVALUATOR_RUNTIME_VERSION, VALIDATOR_VERSION } from "./skill-contracts";

export async function upsertHarnessContextSnapshot(input: {
  runId: string;
  repoUrl: string;
  contextPack: RepoContextPack | null;
  executionMode: string;
}) {
  const pack = input.contextPack;
  const fileTree = pack?.filesIndex.all ?? [];
  const selectedFiles = pack?.snippets.map((s) => s.path) ?? [];
  const lockfileDetected = fileTree.some((p) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|poetry\.lock|Cargo\.lock|go\.sum)$/i.test(p));
  const runtimeDetected = pack?.detected.hasTypeScript
    ? "typescript"
    : Object.entries(pack?.intelligence?.languages ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const commitSha = pack?.commits[0]?.sha ?? null;

  return prisma.harnessContextSnapshot.upsert({
    where: { runId: input.runId },
    create: {
      runId: input.runId,
      repoUrl: input.repoUrl,
      repoOwner: pack?.meta.owner ?? "",
      repoName: pack?.meta.repo ?? "",
      defaultBranch: pack?.meta.defaultBranch ?? null,
      commitSha,
      fileTreeHash: sha256Json(fileTree),
      selectedFilesHash: sha256Json(selectedFiles),
      packageManager: pack?.detected.packageManager ?? null,
      runtimeDetected,
      frameworkDetected: pack?.detected.framework ?? null,
      testFrameworkDetected: pack?.detected.testFramework ?? null,
      lockfileDetected,
      executionMode: input.executionMode,
      workerMode: process.env.SKILLPROOF_WORKER_MODE === "1" ? "worker" : "in_process",
      terminalEnabled: process.env.SKILLPROOF_TERMINAL_ENABLED === "1",
      sandboxed: true,
      evaluatorRuntimeVersion: EVALUATOR_RUNTIME_VERSION,
      validatorVersion: VALIDATOR_VERSION,
    },
    update: {
      repoUrl: input.repoUrl,
      repoOwner: pack?.meta.owner ?? "",
      repoName: pack?.meta.repo ?? "",
      defaultBranch: pack?.meta.defaultBranch ?? null,
      commitSha,
      fileTreeHash: sha256Json(fileTree),
      selectedFilesHash: sha256Json(selectedFiles),
      packageManager: pack?.detected.packageManager ?? null,
      runtimeDetected,
      frameworkDetected: pack?.detected.framework ?? null,
      testFrameworkDetected: pack?.detected.testFramework ?? null,
      lockfileDetected,
      executionMode: input.executionMode,
      workerMode: process.env.SKILLPROOF_WORKER_MODE === "1" ? "worker" : "in_process",
      terminalEnabled: process.env.SKILLPROOF_TERMINAL_ENABLED === "1",
      sandboxed: true,
      evaluatorRuntimeVersion: EVALUATOR_RUNTIME_VERSION,
      validatorVersion: VALIDATOR_VERSION,
    },
  });
}
