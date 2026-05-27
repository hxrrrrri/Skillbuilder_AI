import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { getEmployerProfileBundle, summarizeEmployerProfile } from "@/lib/employer/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole("employer");
    const bundle = await getEmployerProfileBundle(params.id);
    if (!bundle) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ profile: summarizeEmployerProfile(bundle), raw: bundle });
  } catch (err) {
    return authErrorResponse(err);
  }
}
