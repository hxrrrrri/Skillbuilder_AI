import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/auth/audit";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().min(1).max(100),
  notes: z.string().max(1000).optional(),
});

export async function GET() {
  try {
    const user = await requireRole("employer");
    const shortlists = await prisma.employerShortlist.findMany({
      where: { ownerUserId: user.id },
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });
    return NextResponse.json({
      shortlists: shortlists.map((s) => ({
        id: s.id,
        name: s.name,
        notes: s.notes,
        createdAt: s.createdAt,
        itemCount: s.items.length,
      })),
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("employer");
    let body: z.infer<typeof Body>;
    try {
      body = Body.parse(await req.json());
    } catch (err: any) {
      return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
    }
    const shortlist = await prisma.employerShortlist.create({
      data: {
        ownerUserId: user.id,
        tenantId: user.primaryTenantId,
        name: body.name,
        notes: body.notes ?? null,
      },
    });
    await writeAuditLog({
      action: "employer.shortlist.created",
      actorUserId: user.id,
      tenantId: user.primaryTenantId,
      targetType: "shortlist",
      targetId: shortlist.id,
      metadata: { name: shortlist.name },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({ ok: true, shortlist }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err);
  }
}
