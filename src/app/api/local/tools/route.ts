import { NextResponse } from "next/server";
import { detectAllTools } from "@/lib/local-runner/detect";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;
  try {
    const report = await detectAllTools();
    return NextResponse.json(report);
  } catch (err: any) {
    return NextResponse.json({ error: "detect_failed", detail: err?.message ?? String(err) }, { status: 500 });
  }
}
