import { NextResponse } from "next/server";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import { TOOLS } from "@/lib/copilot/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;

  // Full registry including forbidden tools, so admins can see exactly what the
  // copilot can and cannot do. Forbidden tools are listed but never executable.
  const tools = TOOLS.map((t) => ({
    name: t.name,
    risk: t.risk,
    mode: t.mode,
    title: t.title,
    description: t.description,
  }));
  return NextResponse.json({ tools });
}
