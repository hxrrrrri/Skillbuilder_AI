import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/auth/audit";
import { isNextResponse, requireAdminApi } from "@/lib/auth/guards-api";
import {
  AGENT_NAMES,
  PROMPT_MAX_LENGTH,
  PromptValidationError,
  createPromptVersion,
  listPromptVersions,
} from "@/lib/providers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  agent_name: z.enum(AGENT_NAMES),
  system: z.string().max(PROMPT_MAX_LENGTH),
  instructions: z.string().max(PROMPT_MAX_LENGTH).nullable().optional(),
  activate: z.boolean().optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;

  const url = new URL(req.url);
  const agent = url.searchParams.get("agent") ?? undefined;
  if (agent && !(AGENT_NAMES as readonly string[]).includes(agent)) {
    return NextResponse.json({ error: "unknown_agent" }, { status: 400 });
  }

  const versions = await listPromptVersions(agent);
  return NextResponse.json({ versions });
}

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;

  let body: z.infer<typeof CreateBody>;
  try {
    body = CreateBody.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  try {
    const created = await createPromptVersion({
      agentName: body.agent_name,
      system: body.system,
      instructions: body.instructions ?? null,
      activate: !!body.activate,
      createdById: auth.user.id,
    });
    await writeAuditLog({
      action: "admin.prompt.create",
      actorUserId: auth.user.id,
      tenantId: null,
      targetType: "prompt",
      targetId: created.id,
      metadata: {
        agent: created.agentName,
        version: created.version,
        activated: created.isActive,
      },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({ ok: true, prompt: created }, { status: 201 });
  } catch (err: any) {
    if (err instanceof PromptValidationError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: "create_failed", detail: err?.message ?? String(err) }, { status: 500 });
  }
}
