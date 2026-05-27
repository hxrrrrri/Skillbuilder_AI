import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auth/audit";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string; itemId: string } }) {
  try {
    const user = await requireRole("employer");
    const item = await prisma.employerShortlistItem.findFirst({
      where: {
        id: params.itemId,
        shortlistId: params.id,
        shortlist: { ownerUserId: user.id },
      },
    });
    if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await prisma.employerShortlistItem.delete({ where: { id: item.id } });
    await writeAuditLog({
      action: "employer.shortlist.item.deleted",
      actorUserId: user.id,
      tenantId: user.primaryTenantId,
      targetType: "shortlist_item",
      targetId: item.id,
      metadata: { shortlist_id: params.id, public_profile_id: item.publicProfileId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
