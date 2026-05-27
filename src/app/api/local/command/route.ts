import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { evaluatePolicy } from "@/lib/local-runner/policies";
import { runCommand, summarize } from "@/lib/local-runner/terminal";
import { resolveSafeRunCwd } from "@/lib/local-runner/workspace";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/auth/audit";
import { saveCommandRunAsEvidence } from "@/lib/local-runner/terminal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  command: z.string().min(1).max(80),
  args: z.array(z.string().max(500)).max(40).default([]),
  cwd: z.string().max(500).optional(),
  mission_id: z.string().optional(),
  runId: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  approved: z.boolean().optional(),
  saveAsEvidence: z.boolean().optional(),
  usedFor: z
    .enum(["install", "testing", "build", "git", "security", "ownership", "agent", "typecheck", "lint"])
    .optional(),
});

function sha256Hex(...parts: string[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(p ?? "");
  return h.digest("hex");
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const ip = req.headers.get("x-forwarded-for") ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (process.env.NODE_ENV === "production" && process.env.SKILLPROOF_TERMINAL_ENABLED !== "1") {
    return NextResponse.json(
      {
        error: "terminal_disabled",
        reason: "terminal execution disabled — set SKILLPROOF_TERMINAL_ENABLED=1 to enable",
      },
      { status: 403 },
    );
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const runId = body.runId ?? body.mission_id;

  if (!runId) {
    return NextResponse.json(
      { error: "missing_run_id", reason: "terminal commands must be scoped to a verification run" },
      { status: 400 },
    );
  }

  let runOwnerId: string | null = null;
  let runTenantId: string | null = null;
  const runRow = await prisma.analysisRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      createdByUserId: true,
      candidate: { select: { userId: true } },
      tenantId: true,
    },
  });
  if (!runRow) {
    return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  }
  runOwnerId = runRow.createdByUserId ?? runRow.candidate?.userId ?? null;
  runTenantId = runRow.tenantId ?? null;

  const isOwner =
    runRow.createdByUserId === user.id ||
    (!!runRow.candidate?.userId && runRow.candidate.userId === user.id);
  const isAdmin = isAdminRole(user.role);
  if (!isOwner && !isAdmin) {
    await writeAuditLog({
      action: "terminal.forbidden",
      actorUserId: user.id,
      tenantId: runTenantId,
      targetType: "run",
      targetId: runId,
      metadata: { command: body.command, reason: runOwnerId ? "not_run_owner" : "run_has_no_owner" },
      ip,
      userAgent,
    });
    return NextResponse.json(
      { error: "forbidden", reason: "only the run owner or an admin can execute against this run" },
      { status: 403 },
    );
  }

  const safeCwd = resolveSafeRunCwd(body.cwd, runId);
  if (!safeCwd.ok) {
    return NextResponse.json({ error: "cwd_blocked", reason: safeCwd.reason }, { status: 403 });
  }

  const policy = evaluatePolicy({ command: body.command, args: body.args, approved: !!body.approved });
  if (!policy.allowed && policy.requiresApproval) {
    await writeAuditLog({
      action: "terminal.command.approval_required",
      actorUserId: user.id,
      tenantId: runTenantId,
      targetType: "run",
      targetId: runId,
      metadata: {
        command: body.command,
        args: body.args,
        reason: policy.reason,
      },
      ip,
      userAgent,
    });
    return NextResponse.json({ error: "approval_required", reason: policy.reason }, { status: 403 });
  }
  if (!policy.allowed) {
    await writeAuditLog({
      action: "terminal.command.blocked",
      actorUserId: user.id,
      tenantId: runTenantId,
      targetType: "run",
      targetId: runId,
      metadata: {
        command: body.command,
        args: body.args,
        reason: policy.reason,
      },
      ip,
      userAgent,
    });
    return NextResponse.json({ error: "blocked", reason: policy.reason }, { status: 403 });
  }

  if (body.approved) {
    await writeAuditLog({
      action: "terminal.command.approved",
      actorUserId: user.id,
      tenantId: runTenantId,
      targetType: "run",
      targetId: runId,
      metadata: { command: body.command, args: body.args, reason: policy.reason },
      ip,
      userAgent,
    }).catch(() => {});
  }

  const run = await runCommand({
    command: body.command,
    args: body.args,
    cwd: safeCwd.cwd,
    approved: !!body.approved,
    timeoutMs: 120_000,
  });

  const outputHash = sha256Hex(run.stdout, "\0", run.stderr);
  const redactionWarning = /\[REDACTED[_A-Z]*\]/.test(`${run.stdout}\n${run.stderr}`);

  await prisma.terminalCommandRun.create({
    data: {
      id: run.id,
      command: run.command,
      args: JSON.stringify(run.args),
      cwd: run.cwd,
      exitCode: run.exitCode,
      stdoutSummary: summarize(run.stdout, 1200),
      stderrSummary: summarize(run.stderr, 800),
      durationMs: run.durationMs,
      outputHash,
      usedFor: body.usedFor ?? "agent",
      ranAt: run.completedAt ? new Date(run.completedAt) : new Date(),
      actorUserId: user.id,
      runId,
      savedAsEvidence: false,
    },
  });

  if (body.saveAsEvidence) {
    try {
      await saveCommandRunAsEvidence({
        commandRunId: run.id,
        runId,
        actorUserId: user.id,
        isAdmin,
      });
      await writeAuditLog({
        action: "terminal.command.saved_as_evidence",
        actorUserId: user.id,
        tenantId: runTenantId,
        targetType: "TerminalCommandRun",
        targetId: run.id,
        metadata: { runId, usedFor: body.usedFor ?? "agent" },
        ip,
        userAgent,
      });
    } catch (err) {
      // non-fatal
    }
  }

  await writeAuditLog({
    action: "terminal.command.executed",
    actorUserId: user.id,
    tenantId: runTenantId,
    targetType: "run",
    targetId: runId,
    metadata: {
      command: body.command,
      args: body.args,
      exitCode: run.exitCode,
      status: run.status,
      durationMs: run.durationMs,
      outputSha256: outputHash,
      savedAsEvidence: !!body.saveAsEvidence,
      usedFor: body.saveAsEvidence ? body.usedFor ?? "agent" : null,
      commandRunId: run.id,
    },
    ip,
    userAgent,
  });

  return NextResponse.json({ ...run, outputSha256: outputHash, redactionWarning });
}
