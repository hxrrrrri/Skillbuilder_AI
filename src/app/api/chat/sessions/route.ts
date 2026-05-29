import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  mode: z.enum(["help", "admin"]).default("help"),
  title: z.string().max(120).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ sessions: [] });
  const sessions = await prisma.chatSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, mode: true, title: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();

  let body: z.infer<typeof CreateBody>;
  try {
    body = CreateBody.parse(await req.json().catch(() => ({})));
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  // Admin-mode sessions require an admin. Help-mode sessions are open (anonymous allowed).
  if (body.mode === "admin" && !(user && isAdminRole(user.role))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const session = await prisma.chatSession.create({
    data: {
      userId: user?.id ?? null,
      mode: body.mode,
      role: user?.role ?? null,
      title: body.title ?? (body.mode === "admin" ? "Command Copilot" : "Help"),
    },
    select: { id: true, mode: true, title: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ session }, { status: 201 });
}
