import { NextResponse } from "next/server";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import { buildProviderRegistry } from "@/lib/providers/provider-router";
import { recordProviderTest, getProviderConfig } from "@/lib/providers/registry";
import { writeAuditLog } from "@/lib/auth/audit";
import type { ProviderId } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { providerId: string } }) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;

  const existing = await getProviderConfig(params.providerId);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const reg = await buildProviderRegistry();
  const provider = reg[params.providerId as ProviderId];
  if (!provider) {
    await recordProviderTest(params.providerId, {
      status: "unavailable",
      error: "unknown provider id",
      jsonOk: false,
    });
    return NextResponse.json({ error: "unknown_provider" }, { status: 400 });
  }

  const available = await provider.available();
  if (!available) {
    const health = provider.health ? await provider.health() : null;
    const error = health?.lastError ?? health?.status ?? "provider not available — check setup";
    await recordProviderTest(params.providerId, {
      status: "unavailable",
      error,
      raw: health?.rawOutputPreview ?? health?.lastRawOutputPreview ?? null,
      jsonOk: false,
    });
    await writeAuditLog({
      action: "admin.provider.test",
      actorUserId: auth.user.id,
      tenantId: null,
      targetType: "provider",
      targetId: params.providerId,
      metadata: { ok: false, status: health?.status ?? "unavailable", error },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({
      provider_id: params.providerId,
      available: false,
      json: null,
      status: health?.status ?? "unavailable",
      fix: health?.fix ?? "Open Admin -> Providers -> Health and follow provider setup instructions.",
      error,
    });
  }

  const prompt = `Return {"ok": true, "provider": "${params.providerId}"}`;
  try {
    const started = Date.now();
    const res = await provider.runJson(
      {
        system: "Reply with ONLY the JSON object requested. No commentary.",
        user: prompt,
        maxTokens: 200,
        temperature: 0,
      },
      `{"ok":boolean,"provider":string}`,
    );
    const latencyMs = Date.now() - started;
    const ok = res.json !== null;
    await recordProviderTest(params.providerId, {
      status: ok ? "ok" : "fail",
      model: res.model ?? null,
      error: ok ? null : "provider returned no valid JSON",
      raw: res.raw,
      jsonOk: ok,
      latencyMs,
    });
    await writeAuditLog({
      action: "admin.provider.test",
      actorUserId: auth.user.id,
      tenantId: null,
      targetType: "provider",
      targetId: params.providerId,
      metadata: { ok, model: res.model ?? null, input_tokens: res.inputTokens, output_tokens: res.outputTokens, latency_ms: latencyMs },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({
      provider_id: params.providerId,
      available: true,
      json: res.json,
      raw: res.raw.slice(0, 4000),
      model: res.model,
      json_parse_success: ok,
      latency_ms: latencyMs,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      error: ok ? null : "provider returned no valid JSON",
    });
  } catch (err: any) {
    await recordProviderTest(params.providerId, {
      status: "fail",
      error: err?.message ?? String(err),
      raw: err?.stdout ?? err?.stderr ?? err?.raw ?? "",
      jsonOk: false,
    });
    await writeAuditLog({
      action: "admin.provider.test",
      actorUserId: auth.user.id,
      tenantId: null,
      targetType: "provider",
      targetId: params.providerId,
      metadata: {
        ok: false,
        error: err?.message ?? String(err),
        code: err?.code ?? null,
        exitCode: err?.exitCode ?? null,
      },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    }).catch(() => {});
    return NextResponse.json({
      provider_id: params.providerId,
      available: true,
      json: null,
      raw: String(err?.stdout ?? err?.stderr ?? err?.raw ?? "").slice(0, 4000),
      code: err?.code ?? null,
      fix: err?.fix ?? "Run the provider health test after fixing setup.",
      error: err?.message ?? String(err),
    });
  }
}
