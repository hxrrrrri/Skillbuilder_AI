import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { checkProviderReadinessForMode, listProviderHealth } from "@/lib/providers/provider-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Mode = z.enum(["api", "cli", "hybrid", "local"]);

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (user.role !== "candidate" && !isAdminRole(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = Mode.safeParse(url.searchParams.get("mode") ?? "api");
  const mode = parsed.success ? parsed.data : "api";
  const [readiness, health] = await Promise.all([
    checkProviderReadinessForMode(mode),
    listProviderHealth().catch(() => []),
  ]);

  return NextResponse.json({
    ok: readiness.ok,
    mode,
    matrix: readiness.matrix,
    blockers: readiness.blockers,
    providers: health.map((h) => ({
      provider_id: h.providerId,
      label: h.label,
      status: h.status,
      enabled: h.enabled,
      installed: h.installed,
      authenticated: h.authenticated,
      version: h.version,
      configured_model: h.configuredModel,
      available_models: h.availableModels,
      supports_json: h.supportsJson,
      supports_non_interactive: h.supportsNonInteractive,
      supports_model_selection: h.supportsModelSelection,
      supports_reasoning_budget: h.supportsReasoningBudget,
      latency_ms: h.lastLatencyMs ?? null,
      last_error: h.lastError ?? null,
      fix: h.fix,
      command: h.command,
    })),
  });
}
