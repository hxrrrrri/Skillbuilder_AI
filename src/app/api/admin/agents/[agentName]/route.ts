import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import {
  getAgentConfig,
  updateAgentConfig,
  validateAgentProvider,
  REASONING_BUDGETS,
  FALLBACK_STRATEGIES,
  COST_TIERS,
  QUALITY_TIERS,
  listProviderConfigs,
} from "@/lib/providers/registry";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Patch = z.object({
  providerId: z.string().min(2).max(40).optional(),
  model: z.string().min(1).max(120).optional(),
  reasoningBudget: z.enum(REASONING_BUDGETS).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(64000).optional(),
  jsonMode: z.boolean().optional(),
  fallbackProvider: z.string().min(2).max(40).nullable().optional(),
  fallbackModel: z.string().max(120).nullable().optional(),
  fallbackStrategy: z.enum(FALLBACK_STRATEGIES).optional(),
  timeoutMs: z.number().int().min(1000).max(600000).optional(),
  retryCount: z.number().int().min(0).max(5).optional(),
  enabled: z.boolean().optional(),
  costTier: z.enum(COST_TIERS).optional(),
  qualityTier: z.enum(QUALITY_TIERS).optional(),
});

export async function PATCH(req: Request, { params }: { params: { agentName: string } }) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;

  const existing = await getAgentConfig(params.agentName);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: z.infer<typeof Patch>;
  try {
    body = Patch.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  // Validate that providerId / fallbackProvider point at known providers.
  if (body.providerId || body.fallbackProvider) {
    const known = await listProviderConfigs();
    const valid = new Set(known.map((p) => p.providerId));
    if (body.providerId && !valid.has(body.providerId)) {
      return NextResponse.json({ error: "unknown_provider", field: "providerId" }, { status: 400 });
    }
    if (body.fallbackProvider && !valid.has(body.fallbackProvider)) {
      return NextResponse.json({ error: "unknown_provider", field: "fallbackProvider" }, { status: 400 });
    }
  }

  // Deterministic ↔ LLM agent pairing is fail-closed: deterministic stages must
  // stay deterministic; LLM agents may not be downgraded to deterministic.
  if (body.providerId) {
    const check = validateAgentProvider(params.agentName, body.providerId);
    if (!check.ok) {
      return NextResponse.json({ error: "invalid_agent_provider", detail: check.reason }, { status: 400 });
    }
  }

  const updated = await updateAgentConfig(params.agentName, body);

  await writeAuditLog({
    action: "admin.agent.update",
    actorUserId: auth.user.id,
    tenantId: null,
    targetType: "agent",
    targetId: params.agentName,
    metadata: {
      changed: Object.keys(body),
      before: pickFields(existing, Object.keys(body) as any),
      after: pickFields(updated, Object.keys(body) as any),
    },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ ok: true, agent: updated });
}

function pickFields<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}
