// Provider test endpoint — runs a tiny JSON prompt through a single provider and
// reports back what came out. Useful because CLI flags drift across versions.

import { NextResponse } from "next/server";
import { z } from "zod";
import { buildProviderRegistry } from "@/lib/providers/provider-router";
import type { ProviderId } from "@/lib/providers/types";
import { adminOrAnonymous, isNextResponse } from "@/lib/auth/guards-api";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  provider_id: z.enum(["anthropic_api", "claude_cli", "codex_cli", "ollama", "copilot_cli", "mock"]),
  prompt: z.string().min(2).max(2000).optional(),
});

export async function POST(req: Request) {
  const auth = await adminOrAnonymous();
  if (isNextResponse(auth)) return auth;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const reg = await buildProviderRegistry();
  const p = reg[body.provider_id as ProviderId];
  if (!p) return NextResponse.json({ error: "unknown_provider" }, { status: 400 });

  const available = await p.available();
  if (!available) {
    return NextResponse.json({
      provider_id: body.provider_id,
      available: false,
      json: null,
      raw: "",
      error: "provider not available — check setup",
    });
  }

  const prompt = body.prompt ?? `Return {"ok": true, "provider": "${body.provider_id}"}`;
  try {
    const res = await p.runJson(
      { system: "Reply with ONLY the JSON object requested. No commentary.", user: prompt, maxTokens: 200, temperature: 0 },
      `{"ok":boolean,"provider":string}`,
    );
    await writeAuditLog({
      action: "admin.providers.test",
      actorUserId: auth.user?.id ?? null,
      tenantId: null,
      targetType: "provider",
      targetId: body.provider_id,
      metadata: {
        json_ok: res.json !== null,
        model: res.model ?? null,
        input_tokens: res.inputTokens ?? null,
        output_tokens: res.outputTokens ?? null,
      },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({
      provider_id: body.provider_id,
      available: true,
      json: res.json,
      raw: res.raw.slice(0, 4000),
      model: res.model,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      error: res.json === null ? "provider returned no valid JSON" : null,
    });
  } catch (err: any) {
    return NextResponse.json({
      provider_id: body.provider_id,
      available: true,
      json: null,
      raw: "",
      error: err?.message ?? String(err),
    });
  }
}
