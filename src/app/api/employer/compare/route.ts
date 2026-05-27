import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { comparePayload, getEmployerProfileBundle, summarizeEmployerProfile } from "@/lib/employer/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  profile_ids: z.array(z.string()).min(2).max(5),
});

export async function POST(req: Request) {
  try {
    await requireRole("employer");
    let body: z.infer<typeof Body>;
    try {
      body = Body.parse(await req.json());
    } catch (err: any) {
      return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
    }
    const uniqueIds = [...new Set(body.profile_ids)];
    if (uniqueIds.length < 2 || uniqueIds.length > 5) {
      return NextResponse.json({ error: "profile_count_out_of_range" }, { status: 400 });
    }
    const bundles = await Promise.all(uniqueIds.map((id) => getEmployerProfileBundle(id)));
    if (bundles.some((b) => !b)) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    const summaries = bundles.map((b) => summarizeEmployerProfile(b!));
    return NextResponse.json({ profiles: comparePayload(summaries) });
  } catch (err) {
    return authErrorResponse(err);
  }
}
