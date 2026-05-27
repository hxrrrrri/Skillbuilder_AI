import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import { updateProviderConfig, getProviderConfig } from "@/lib/providers/registry";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Patch = z.object({
  enabled: z.boolean().optional(),
  defaultModel: z.string().max(120).nullable().optional(),
  baseUrl: z.string().max(400).nullable().optional(),
  command: z.string().max(200).nullable().optional(),
  apiKeyEnv: z
    .string()
    .max(80)
    .regex(/^[A-Z][A-Z0-9_]*$/, "uppercase env var name")
    .nullable()
    .optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { providerId: string } }) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;

  const existing = await getProviderConfig(params.providerId);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: z.infer<typeof Patch>;
  try {
    body = Patch.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const updated = await updateProviderConfig(params.providerId, body);

  await writeAuditLog({
    action: "admin.provider.update",
    actorUserId: auth.user.id,
    tenantId: null,
    targetType: "provider",
    targetId: params.providerId,
    metadata: {
      changed: Object.keys(body),
      before: pickFields(existing, Object.keys(body) as any),
      after: pickFields(updated, Object.keys(body) as any),
    },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ ok: true, provider: updated });
}

function pickFields<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}
