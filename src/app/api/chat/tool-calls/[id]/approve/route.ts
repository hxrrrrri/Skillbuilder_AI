import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi, isNextResponse } from "@/lib/auth/guards-api";
import { approveToolCall } from "@/lib/copilot/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ approval_text: z.string().max(200).nullable().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdminApi();
  if (isNextResponse(auth)) return auth;

  let body: z.infer<typeof Body> = {};
  try {
    body = Body.parse(await req.json().catch(() => ({})));
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const result = await approveToolCall(auth.user, params.id, body.approval_text ?? null);
  if (!result.ok) {
    const status = result.code === "forbidden" ? 403 : result.code === "not_found" ? 404 : 409;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
