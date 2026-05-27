import { NextResponse } from "next/server";
import { detectAllTools } from "@/lib/local-runner/detect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await detectAllTools();
    return NextResponse.json(report);
  } catch (err: any) {
    return NextResponse.json({ error: "detect_failed", detail: err?.message ?? String(err) }, { status: 500 });
  }
}
