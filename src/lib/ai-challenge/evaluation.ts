import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { runCommand, summarize } from "@/lib/local-runner/terminal";
import { runsRoot } from "@/lib/local-runner/workspace";
import type { AICollabEvaluation } from "@/agents/types";
import type { TerminalEvidence } from "@/lib/local-runner/types";

export type ChallengePatchStatus = "not_unified_diff" | "applied" | "failed";

export type ChallengeCheck = {
  command: string;
  usedFor: TerminalEvidence["usedFor"];
  exitCode: number | null;
  commandRunId?: string;
  stdoutSummary?: string;
  stderrSummary?: string;
};

export type ChallengeExecutionProof = {
  workspace?: string;
  patchStatus: ChallengePatchStatus;
  patchFailureReason?: string;
  checks: ChallengeCheck[];
  evidence: NonNullable<AICollabEvaluation["evidence"]>;
  whatThisProves: string[];
  remainingUnverified: string[];
};

export type ChallengeCapInput = {
  patchStatus: ChallengePatchStatus;
  checks: ChallengeCheck[];
  reviewedAiOutput: boolean;
  limitationsDiscussed: boolean;
};

function isUnifiedDiff(diff: string) {
  return /^diff --git\s+/m.test(diff) || /^---\s+/m.test(diff) && /^\+\+\+\s+/m.test(diff);
}

function cap(value: number, max: number) {
  return Math.min(Math.max(0, Math.round(value)), max);
}

export function summarizeExecutionProof(input: Pick<ChallengeExecutionProof, "patchStatus" | "checks" | "patchFailureReason">): Pick<ChallengeExecutionProof, "whatThisProves" | "remainingUnverified"> {
  const whatThisProves: string[] = [];
  const remainingUnverified: string[] = [];
  if (input.patchStatus === "applied") {
    whatThisProves.push("Submitted diff can be applied to the candidate repository.");
  } else if (input.patchStatus === "failed") {
    remainingUnverified.push(`Submitted diff could not be applied${input.patchFailureReason ? `: ${input.patchFailureReason}` : "."}`);
  } else {
    remainingUnverified.push("Submission was not a valid unified diff, so executable patch proof was skipped.");
  }

  const executableChecks = input.checks.filter((c) => c.exitCode !== null);
  if (!executableChecks.length) {
    remainingUnverified.push("No executable tests, typecheck, lint, or build command was available.");
  } else {
    const passing = executableChecks.filter((c) => c.exitCode === 0);
    const failing = executableChecks.filter((c) => c.exitCode !== 0);
    if (passing.length) {
      whatThisProves.push(`${passing.length} safe check(s) ran successfully after applying the submitted diff.`);
    }
    if (failing.length) {
      remainingUnverified.push(`${failing.length} safe check(s) failed after applying the submitted diff.`);
    }
  }
  return { whatThisProves, remainingUnverified };
}

export function applyAiChallengeScoreCaps(evaluation: AICollabEvaluation, caps: ChallengeCapInput): AICollabEvaluation {
  let overallCap = 100;
  const notes: string[] = [];

  if (caps.patchStatus === "failed") {
    overallCap = Math.min(overallCap, 45);
    notes.push("Patch could not be applied, so executable correctness proof is capped.");
  } else if (caps.patchStatus === "not_unified_diff") {
    overallCap = Math.min(overallCap, 45);
    notes.push("Submission was not a valid unified diff, so patch proof is capped.");
  }

  const executableChecks = caps.checks.filter((c) => c.exitCode !== null);
  if (caps.patchStatus === "applied" && executableChecks.length === 0) {
    overallCap = Math.min(overallCap, 70);
    notes.push("No executable checks were available, so the score is capped.");
  }
  if (executableChecks.some((c) => c.exitCode !== 0)) {
    overallCap = Math.min(overallCap, 65);
    notes.push("At least one safe check failed after the submitted diff.");
  }

  const reviewCap = caps.reviewedAiOutput ? 100 : 50;
  const maturityCap = caps.limitationsDiscussed ? 100 : 70;
  const review = cap(evaluation.review_discipline_score, reviewCap);
  const maturity = cap(evaluation.ai_collaboration_maturity_score, maturityCap);
  if (!caps.reviewedAiOutput) notes.push("Candidate did not confirm reviewing AI output.");
  if (!caps.limitationsDiscussed) notes.push("Candidate did not discuss limitations or tradeoffs.");

  return {
    ...evaluation,
    correctness_score: cap(evaluation.correctness_score, overallCap),
    review_discipline_score: review,
    ai_collaboration_maturity_score: maturity,
    overall_score: cap(Math.min(evaluation.overall_score, review, maturity), overallCap),
    feedback: [evaluation.feedback, ...notes].filter(Boolean).join(" "),
  };
}

function challengeWorkspace(runId: string) {
  return path.join(runsRoot(), runId, "ai-challenge");
}

function readPackageScripts(workspace: string): Record<string, string> {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(workspace, "package.json"), "utf8"));
    return typeof pkg?.scripts === "object" && pkg.scripts ? pkg.scripts : {};
  } catch {
    return {};
  }
}

function checkCommands(workspace: string): Array<{ command: string; args: string[]; usedFor: TerminalEvidence["usedFor"] }> {
  const scripts = readPackageScripts(workspace);
  const out: Array<{ command: string; args: string[]; usedFor: TerminalEvidence["usedFor"] }> = [];
  if (scripts.test || scripts["test:ci"]) out.push({ command: "npm", args: ["run", scripts["test:ci"] ? "test:ci" : "test", "--if-present"], usedFor: "testing" });
  if (scripts.typecheck || scripts["type-check"]) out.push({ command: "npm", args: ["run", scripts.typecheck ? "typecheck" : "type-check", "--if-present"], usedFor: "typecheck" });
  if (scripts.lint) out.push({ command: "npm", args: ["run", "lint", "--if-present"], usedFor: "lint" });
  if (scripts.build) out.push({ command: "npm", args: ["run", "build", "--if-present"], usedFor: "build" });
  return out.slice(0, 4);
}

async function persistCommandRun(runId: string, run: Awaited<ReturnType<typeof runCommand>>, usedFor: TerminalEvidence["usedFor"]) {
  const outputHash = createHash("sha256").update(run.stdout).update("\0").update(run.stderr).digest("hex");
  await prisma.terminalCommandRun.upsert({
    where: { id: run.id },
    update: {},
    create: {
      id: run.id,
      command: run.command,
      args: JSON.stringify(run.args),
      cwd: run.cwd,
      exitCode: run.exitCode,
      stdoutSummary: summarize(run.stdout, 1200),
      stderrSummary: summarize(run.stderr, 800),
      durationMs: run.durationMs,
      outputHash,
      usedFor,
      ranAt: run.completedAt ? new Date(run.completedAt) : new Date(),
      runId,
      savedAsEvidence: true,
    },
  }).catch(() => {});
}

export async function buildAiChallengeExecutionProof(input: {
  runId: string;
  repoUrl: string;
  proposedDiff: string;
}): Promise<ChallengeExecutionProof> {
  const workspace = challengeWorkspace(input.runId);
  fs.mkdirSync(path.dirname(workspace), { recursive: true });
  if (!fs.existsSync(workspace)) {
    const clone = await runCommand({
      command: "git",
      args: ["clone", "--depth", "50", "--single-branch", input.repoUrl, workspace],
      timeoutMs: 90_000,
      approved: true,
    });
    await persistCommandRun(input.runId, clone, "git");
    if (clone.exitCode !== 0) {
      const summary = summarize(clone.stderr || clone.stdout, 800);
      const proof: ChallengeExecutionProof = {
        workspace,
        patchStatus: "failed" as ChallengePatchStatus,
        patchFailureReason: `clone failed: ${summary}`,
        checks: [],
        evidence: [{ reason: `AI challenge workspace clone failed: ${summary}`, source: "challenge" as const, confidence: 0.8 }],
        whatThisProves: [],
        remainingUnverified: [`Could not clone the candidate repository for challenge execution: ${summary}`],
      };
      return proof;
    }
  }

  let patchStatus: ChallengePatchStatus = "not_unified_diff";
  let patchFailureReason: string | undefined;
  if (isUnifiedDiff(input.proposedDiff)) {
    const check = await runCommand({
      command: "git",
      args: ["apply", "--check", "-"],
      cwd: workspace,
      input: input.proposedDiff,
      timeoutMs: 20_000,
      approved: true,
    });
    await persistCommandRun(input.runId, check, "ai_challenge");
    if (check.exitCode === 0) {
      const apply = await runCommand({
        command: "git",
        args: ["apply", "-"],
        cwd: workspace,
        input: input.proposedDiff,
        timeoutMs: 20_000,
        approved: true,
      });
      await persistCommandRun(input.runId, apply, "ai_challenge");
      patchStatus = apply.exitCode === 0 ? "applied" : "failed";
      if (apply.exitCode !== 0) patchFailureReason = summarize(apply.stderr || apply.stdout, 400);
    } else {
      patchStatus = "failed";
      patchFailureReason = summarize(check.stderr || check.stdout, 400);
    }
  }

  const checks: ChallengeCheck[] = [];
  if (patchStatus === "applied") {
    for (const cmd of checkCommands(workspace)) {
      const run = await runCommand({
        command: cmd.command,
        args: cmd.args,
        cwd: workspace,
        timeoutMs: 120_000,
        approved: true,
        env: { CI: "1" },
      });
      await persistCommandRun(input.runId, run, cmd.usedFor);
      checks.push({
        command: [run.command, ...run.args].join(" "),
        usedFor: cmd.usedFor,
        exitCode: run.exitCode,
        commandRunId: run.id,
        stdoutSummary: summarize(run.stdout, 400),
        stderrSummary: summarize(run.stderr, 400),
      });
    }
  }

  const summary = summarizeExecutionProof({ patchStatus, patchFailureReason, checks });
  return {
    workspace,
    patchStatus,
    patchFailureReason,
    checks,
    evidence: [
      {
        reason: patchStatus === "applied"
          ? "Submitted AI-collaboration diff applied cleanly to the challenge workspace."
          : patchStatus === "failed"
            ? `Submitted diff failed to apply: ${patchFailureReason ?? "unknown apply failure"}`
            : "Submitted challenge response was not a valid unified diff.",
        source: "challenge",
        confidence: 0.85,
      },
      ...checks.map((c) => ({
        reason: `Challenge check ${c.command} exited ${c.exitCode}.`,
        source: "terminal" as const,
        confidence: c.exitCode === 0 ? 0.85 : 0.7,
      })),
    ],
    ...summary,
  };
}
