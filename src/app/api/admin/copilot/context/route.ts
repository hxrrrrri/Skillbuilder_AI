import { NextResponse } from "next/server";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import {
  listAgentConfigs,
  listProviderConfigs,
} from "@/lib/providers/registry";
import { checkProviderReadinessForMode } from "@/lib/providers/provider-router";
import { buildCopilotContext } from "@/lib/copilot/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;

  const url = new URL(req.url);
  const page = url.searchParams.get("page");

  const context = await buildCopilotContext(
    { mode: "admin", page, user: auth.user },
    {
      listProviderConfigs,
      listAgentConfigs,
      checkReadiness: (m) => checkProviderReadinessForMode(m),
    },
  );
  return NextResponse.json({ context });
}
