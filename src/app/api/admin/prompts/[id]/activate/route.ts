import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auth/audit";
import { isNextResponse, requireAdminApi } from "@/lib/auth/guards-api";
import { PromptValidationError, activatePromptVersion } from "@/lib/providers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;

  try {
    const activated = await activatePromptVersion(params.id);
    await writeAuditLog({
      action: "admin.prompt.activate",
      actorUserId: auth.user.id,
      tenantId: null,
      targetType: "prompt",
      targetId: activated.id,
      metadata: {
        agent: activated.agentName,
        version: activated.version,
      },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({ ok: true, prompt: activated });
  } catch (err: any) {
    if (err instanceof PromptValidationError && err.code === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "activate_failed", detail: err?.message ?? String(err) }, { status: 500 });
  }
}
