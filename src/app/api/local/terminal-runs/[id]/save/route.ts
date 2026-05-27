import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/auth/audit";
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
      tenantId: user.primaryTenantId,
      targetType: "TerminalCommandRun",
      targetId: params.id,
      metadata: { runId: body.run_id, usedFor: evidence.usedFor },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({ ok: true, evidence });
  } catch (err) {
    if (err instanceof TerminalEvidenceError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error("[terminal-save] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
