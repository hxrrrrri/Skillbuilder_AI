import { prisma } from "@/lib/db";
import type { TerminalEvidence } from "./types";

export async function saveCommandRunAsEvidence(input: {
  commandRunId: string;
  runId: string;
  actorUserId: string;
  isAdmin: boolean;
}): Promise<TerminalEvidence> {
  const commandRun = await prisma.terminalCommandRun.findUnique({
    where: { id: input.commandRunId },
    include: { run: { select: { id: true, createdByUserId: true, candidate: { select: { userId: true } }, terminalEvidence: true } } },
  });
  if (!commandRun || commandRun.runId !== input.runId || !commandRun.run) {
    throw new TerminalEvidenceError(404, "command_run_not_found");
  }

  const ownerId = commandRun.run.createdByUserId ?? commandRun.run.candidate?.userId ?? null;
  if (!input.isAdmin && ownerId !== input.actorUserId) {
    throw new TerminalEvidenceError(403, "forbidden");
  }

  const evidence: TerminalEvidence = {
    commandRunId: commandRun.id,
    command: [commandRun.command, ...safeArgs(commandRun.args)].join(" "),
    cwd: commandRun.cwd,
    exitCode: commandRun.exitCode,
    stdoutSummary: commandRun.stdoutSummary,
    stderrSummary: commandRun.stderrSummary,
    durationMs: commandRun.durationMs,
    usedFor: commandRun.usedFor as TerminalEvidence["usedFor"],
    outputSha256: commandRun.outputHash,
    redactionWarning: /\[REDACTED[_A-Z]*\]/.test(`${commandRun.stdoutSummary}\n${commandRun.stderrSummary}`),
    evidenceSource: "sandbox_terminal",
    includeInReport: true,
  };

  const existing = parseEvidence(commandRun.run.terminalEvidence);
  const already = existing.some((e) => e.commandRunId === commandRun.id);
  const next = already ? existing : [evidence, ...existing];
  if (!already || !commandRun.savedAsEvidence) {
    await prisma.$transaction([
      prisma.analysisRun.update({
        where: { id: input.runId },
        data: { terminalEvidence: JSON.stringify(next) },
      }),
      prisma.terminalCommandRun.update({
        where: { id: commandRun.id },
        data: { savedAsEvidence: true },
      }),
    ]);
  }
  return evidence;
}

export class TerminalEvidenceError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function parseEvidence(raw: string | null): TerminalEvidence[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeArgs(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
