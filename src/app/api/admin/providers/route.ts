import { NextResponse } from "next/server";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import { listProviderConfigs } from "@/lib/providers/registry";
import { listProviderHealth } from "@/lib/providers/provider-router";
import { modelsForProvider } from "@/lib/providers/model-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;
  const url = new URL(req.url);
  const includeLive = url.searchParams.get("live") === "1";
  const [providers, health] = await Promise.all([
    listProviderConfigs(),
    includeLive ? listProviderHealth().catch(() => []) : Promise.resolve([]),
  ]);
  const healthByProvider = new Map(health.map((h) => [h.providerId, h]));
  return NextResponse.json({
    providers: providers.map((p) => {
      const parsedCapabilities = p.capabilities ? safeJson(p.capabilities) : null;
      const capabilities =
        parsedCapabilities && typeof parsedCapabilities === "object"
          ? (parsedCapabilities as Record<string, unknown>)
          : {};
      const live = healthByProvider.get(p.providerId as any);
      return {
        ...p,
        capabilities: {
          ...capabilities,
          models: modelsForProvider(
            p.providerId,
            live?.availableModels?.length
              ? live.availableModels
              : Array.isArray(capabilities.models)
                ? capabilities.models.filter((m): m is string => typeof m === "string")
                : [],
          ),
        },
        liveStatus: live?.status ?? null,
        liveAvailable: live?.status === "ready",
        liveModels: live?.availableModels ?? [],
        liveConfiguredModel: live?.configuredModel ?? null,
        liveLastError: live?.lastError ?? null,
      };
    }),
  });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
