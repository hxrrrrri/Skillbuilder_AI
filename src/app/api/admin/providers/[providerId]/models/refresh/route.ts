import { NextResponse } from "next/server";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import { getProviderConfig } from "@/lib/providers/registry";
import { refreshProviderModels } from "@/lib/providers/model-discovery";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — probe the provider live, persist the discovered list, return options.
export async function POST(req: Request, { params }: { params: { providerId: string } }) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;
  const existing = await getProviderConfig(params.providerId);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const options = await refreshProviderModels(params.providerId);
  await writeAuditLog({
    action: "admin.provider.refresh_models",
    actorUserId: auth.user.id,
    tenantId: null,
    targetType: "provider",
    targetId: params.providerId,
    metadata: { status: options.status, count: options.options.length },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return NextResponse.json({ ok: true, ...options });
}
