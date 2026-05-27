import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { evaluatePolicy } from "@/lib/local-runner/policies";
import { runCommand, summarize } from "@/lib/local-runner/terminal";
import type { TerminalEvidence } from "@/lib/local-runner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  command: z.string().min(1).max(80),
  args: z.array(z.string().max(500)).max(40).default([]),
  cwd: z.string().max(500).optional(),
  mission_id: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  approved: z.boolean().optional(),
  saveAsEvidence: z.boolean().optional(),
  usedFor: z.enum(["testing", "build", "git", "security", "ownership", "agent", "typecheck"]).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const policy = evaluatePolicy({ command: body.command, args: body.args, approved: !!body.approved });
  if (!policy.allowed && policy.requiresApproval) {
    return NextResponse.json({ error: "approval_required", reason: policy.reason }, { status: 403 });
  }
  if (!policy.allowed) {
    return NextResponse.json({ error: "blocked", reason: policy.reason }, { status: 403 });
  }

  const run = await runCommand({
    command: body.command,
    args: body.args,
    cwd: body.cwd,
    approved: !!body.approved,
    timeoutMs: 120_000,
  });

  if (body.saveAsEvidence && body.mission_id) {
    try {
      const existing = await prisma.analysisRun.findUnique({
        where: { id: body.mission_id },
        select: { terminalEvidence: true },
      });
      const list: TerminalEvidence[] = existing?.terminalEvidence ? JSON.parse(existing.terminalEvidence) : [];
      list.push({
        command: [run.command, ...run.args].join(" "),
        cwd: run.cwd,
        exitCode: run.exitCode,
        stdoutSummary: summarize(run.stdout, 1200),
        stderrSummary: summarize(run.stderr, 800),
        durationMs: run.durationMs,
        usedFor: body.usedFor ?? "agent",
      });
      await prisma.analysisRun.update({
        where: { id: body.mission_id },
        data: { terminalEvidence: JSON.stringify(list) },
      });
    } catch (err) {
      // non-fatal
    }
  }

  return NextResponse.json(run);
}
