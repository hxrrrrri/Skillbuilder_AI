// Provider test endpoint — runs a tiny JSON prompt through a single provider and
// reports back what came out. Useful because CLI flags drift across versions.

import { NextResponse } from "next/server";
import { z } from "zod";
import { buildProviderRegistry } from "@/lib/providers/provider-router";
import type { ProviderId } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  provider_id: z.enum(["anthropic_api", "claude_cli", "codex_cli", "ollama", "copilot_cli", "mock"]),
  prompt: z.string().min(2).max(2000).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const reg = buildProviderRegistry();
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
