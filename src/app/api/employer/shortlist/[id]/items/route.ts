import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/auth/audit";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  public_profile_id: z.string(),
  note: z.string().max(1000).optional(),
  position: z.number().int().min(0).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("employer");
    const shortlist = await prisma.employerShortlist.findFirst({
      where: { id: params.id, ownerUserId: user.id },
    });
    if (!shortlist) return NextResponse.json({ error: "not_found" }, { status: 404 });

    let body: z.infer<typeof Body>;
    try {
      body = Body.parse(await req.json());
    } catch (err: any) {
      return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
    }
    const profile = await prisma.publicProfile.findFirst({
      where: { id: body.public_profile_id, visibility: "public" },
    });
    if (!profile) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });

    const item = await prisma.employerShortlistItem.upsert({
      where: {
        shortlistId_publicProfileId: {
          shortlistId: shortlist.id,
          publicProfileId: profile.id,
        },
      },
      update: {
        note: body.note ?? null,
        position: body.position ?? undefined,
      },
      create: {
        shortlistId: shortlist.id,
        publicProfileId: profile.id,
        note: body.note ?? null,
        position: body.position ?? 0,
      },
    });
    await writeAuditLog({
      action: "employer.shortlist.item.added",
      actorUserId: user.id,
      tenantId: user.primaryTenantId,
      targetType: "shortlist_item",
      targetId: item.id,
      metadata: { shortlist_id: shortlist.id, public_profile_id: profile.id },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err);
  }
}
