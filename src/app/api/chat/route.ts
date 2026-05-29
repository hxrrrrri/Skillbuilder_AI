import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { RATE_LIMITS, rateLimitKey, rateLimitedResponseInit } from "@/lib/rate-limit";
import {
  runCopilotTurn,
  CopilotProviderNotReadyError,
  CopilotForbiddenError,
} from "@/lib/copilot/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  session_id: z.string().min(2).max(60),
  message: z.string().min(1).max(8000),
  mode: z.enum(["help", "admin"]).default("help"),
  page: z.string().max(200).nullable().optional(),
  provider_id: z.string().max(40).nullable().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();

  const limit = RATE_LIMITS.chat.consume(rateLimitKey(req, user?.id));
  if (!limit.allowed) {
    const init = rateLimitedResponseInit(limit);
    return NextResponse.json(init.body, { status: init.status, headers: init.headers });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  if (body.mode === "admin" && !(user && isAdminRole(user.role))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const session = await prisma.chatSession.findUnique({ where: { id: body.session_id } });
  if (!session) return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  if (session.mode !== body.mode) {
    return NextResponse.json({ error: "mode_mismatch" }, { status: 400 });
  }
  // Ownership: signed-in users own their sessions; anonymous help sessions (userId null) stay open.
  const owns = session.userId ? !!user && session.userId === user.id : true;
  if (!owns && !(user && isAdminRole(user.role))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await runCopilotTurn({
      user,
      mode: body.mode,
      sessionId: session.id,
      message: body.message,
      page: body.page ?? null,
      requestedProvider: body.provider_id ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CopilotProviderNotReadyError) {
      return NextResponse.json(
        { error: "provider_not_ready", message: err.message, fix: err.fix, route: err.route, tried: err.tried },
        { status: 409 },
      );
    }
    if (err instanceof CopilotForbiddenError) {
      return NextResponse.json({ error: "forbidden", reason: err.code }, { status: 403 });
    }
    console.error("[api/chat] turn failed", err);
    return NextResponse.json({ error: "chat_failed", detail: (err as Error)?.message }, { status: 500 });
  }
}
