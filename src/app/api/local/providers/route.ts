import { NextResponse } from "next/server";
import { z } from "zod";
import { loadProviderConfig, saveProviderConfig, type ProviderConfig } from "@/lib/providers/config";
import { listProviderAvailability, selectProviderMatrix } from "@/lib/providers/provider-router";
import { adminOrAnonymous, isNextResponse } from "@/lib/auth/guards-api";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Mode = z.enum(["api", "cli", "hybrid", "local"]);

export async function GET(req: Request) {
  const auth = await adminOrAnonymous();
  if (isNextResponse(auth)) return auth;

  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") as any) || "hybrid";
  const parsed = Mode.safeParse(mode);
  const effective = parsed.success ? parsed.data : "hybrid";
  const [availability, matrix] = await Promise.all([
    listProviderAvailability(),
    selectProviderMatrix(effective),
  ]);
  return NextResponse.json({
    config: loadProviderConfig(),
    availability,
    matrix,
    mode: effective,
  });
}

const ConfigBody = z.object({
  config: z.any(),
});

export async function POST(req: Request) {
  const auth = await adminOrAnonymous();
  if (isNextResponse(auth)) return auth;

  let body: z.infer<typeof ConfigBody>;
  try {
    body = ConfigBody.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }
  try {
    saveProviderConfig(body.config as ProviderConfig);
    await writeAuditLog({
      action: "admin.providers.update",
      actorUserId: auth.user?.id ?? null,
      tenantId: null,
      targetType: "provider_config",
      targetId: null,
      metadata: { provider_keys: Object.keys(body.config?.providers ?? {}) },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({ ok: true, config: loadProviderConfig() });
  } catch (err: any) {
    return NextResponse.json({ error: "save_failed", detail: err?.message }, { status: 500 });
  }
}
