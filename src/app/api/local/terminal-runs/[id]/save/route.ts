import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/auth/audit";
import { prisma } from "@/lib/db";
import { evaluateRunMutationAccess } from "@/lib/auth/guards-api";
import { saveCommandRunAsEvidence, TerminalEvidenceError } from "@/lib/local-runner/terminal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  run_id: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const run = await prisma.analysisRun.findUnique({
    where: { id: body.run_id },
    select: {
      id: true,
      candidateId: true,
      createdByUserId: true,
      tenantId: true,
      candidate: { select: { userId: true } },
    },
  });
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });

  const decision = evaluateRunMutationAccess(user, {
    candidateId: run.candidateId,
    createdByUserId: run.createdByUserId,
    tenantId: run.tenantId,
    candidateUserId: run.candidate?.userId ?? null,
  }, "save_terminal_evidence");
  if (!decision.ok) {
    await writeAuditLog({
      action: "terminal.command.save_denied",
      actorUserId: user.id,
      tenantId: run.tenantId,
      targetType: "TerminalCommandRun",
      targetId: params.id,
      metadata: { runId: body.run_id, reason: decision.reason },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    }).catch(() => {});
    return decision.response;
  }

  try {
    const evidence = await saveCommandRunAsEvidence({
      commandRunId: params.id,
      runId: body.run_id,
      actorUserId: user.id,
      isAdmin: isAdminRole(user.role),
    });
    await writeAuditLog({
      action: "terminal.command.saved_as_evidence",
      actorUserId: user.id,
      tenantId: run.tenantId ?? user.primaryTenantId,
      targetType: "TerminalCommandRun",
      targetId: params.id,
      metadata: { runId: body.run_id, usedFor: evidence.usedFor },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({ ok: true, evidence });
  } catch (err) {
    if (err instanceof TerminalEvidenceError) {
      await writeAuditLog({
        action: "terminal.command.save_denied",
        actorUserId: user.id,
        tenantId: run.tenantId,
        targetType: "TerminalCommandRun",
        targetId: params.id,
        metadata: { runId: body.run_id, reason: err.code },
        ip: req.headers.get("x-forwarded-for") ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
      }).catch(() => {});
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error("[terminal-save] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
