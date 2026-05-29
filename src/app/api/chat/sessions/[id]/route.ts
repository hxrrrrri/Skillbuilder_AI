import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const session = await prisma.chatSession.findUnique({
    where: { id: params.id },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
      toolCalls: { orderBy: { createdAt: "asc" }, include: { approval: true } },
    },
  });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Owner or admin only. Anonymous help sessions (userId null) are not listable here.
  const isOwner = !!user && session.userId === user.id;
  const isAdmin = !!user && isAdminRole(user.role);
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({ session });
}
