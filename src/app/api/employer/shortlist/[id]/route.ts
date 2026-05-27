import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { summarizeEmployerProfile } from "@/lib/employer/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("employer");
    const shortlist = await prisma.employerShortlist.findFirst({
      where: { id: params.id, ownerUserId: user.id },
      include: {
        items: {
          orderBy: [{ position: "asc" }, { addedAt: "asc" }],
          include: {
            profile: {
              include: {
                candidate: { select: { name: true, githubUsername: true } },
                run: {
                  include: {
                    repository: true,
                    scores: true,
                    questions: { select: { answer: true, answerScore: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!shortlist) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({
      shortlist: {
        id: shortlist.id,
        name: shortlist.name,
        notes: shortlist.notes,
        createdAt: shortlist.createdAt,
        items: shortlist.items.map((item) => ({
          id: item.id,
          note: item.note,
          position: item.position,
          addedAt: item.addedAt,
          profile: summarizeEmployerProfile(item.profile as any),
        })),
      },
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
