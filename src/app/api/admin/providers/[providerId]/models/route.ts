import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import { getProviderConfig, setCustomModels } from "@/lib/providers/registry";
import { getModelOptionsForProvider } from "@/lib/providers/model-discovery";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — current dropdown options (cached discovery + custom + static). Cheap;
// does NOT probe live (use POST /refresh for that).
export async function GET(_req: Request, { params }: { params: { providerId: string } }) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;
  const existing = await getProviderConfig(params.providerId);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const options = await getModelOptionsForProvider(params.providerId);
  return NextResponse.json({ ok: true, ...options });
}

const Body = z.object({
  // Replace the full custom-model list, or add a single model.
  customModels: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  addModel: z.string().trim().min(1).max(120).optional(),
});

// POST — manage admin custom models for this provider.
export async function POST(req: Request, { params }: { params: { providerId: string } }) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;
  const existing = await getProviderConfig(params.providerId);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const current = await getModelOptionsForProvider(params.providerId);
  let next = body.customModels ?? current.customModels;
  if (body.addModel) next = [...next, body.addModel];
  next = Array.from(new Set(next.map((model) => model.trim()).filter(Boolean)));
  if (next.length > 50) {
    return NextResponse.json({ error: "custom_model_limit", detail: "At most 50 custom models are allowed." }, { status: 400 });
  }

  await setCustomModels(params.providerId, next);
  await writeAuditLog({
    action: "admin.provider.custom_models",
    actorUserId: auth.user.id,
    tenantId: null,
    targetType: "provider",
    targetId: params.providerId,
    metadata: { count: next.length },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  const options = await getModelOptionsForProvider(params.providerId);
  return NextResponse.json({ ok: true, ...options });
}
