import { NextResponse } from "next/server";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import { listAgentConfigs } from "@/lib/providers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;
  const agents = await listAgentConfigs();
  return NextResponse.json({ agents });
}
