import { NextResponse } from "next/server";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import { listProviderConfigs } from "@/lib/providers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;
  const providers = await listProviderConfigs();
  return NextResponse.json({
    providers: providers.map((p) => ({
      ...p,
      capabilities: p.capabilities ? safeJson(p.capabilities) : null,
    })),
  });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
