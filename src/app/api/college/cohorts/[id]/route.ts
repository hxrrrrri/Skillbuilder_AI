import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CollegeAuthError, resolveCollegeScope } from "@/lib/college/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("college_admin", "college_member");
    const scope = resolveCollegeScope(user);
    const cohort = await prisma.cohort.findFirst({
      where: { id: params.id, tenantId: scope.tenantId },
      include: {
        students: {
          include: {
            candidate: {
              include: {
                runs: {
                  where: { tenantId: scope.tenantId },
                  orderBy: { createdAt: "desc" },
                  include: { repository: true },
                },
              },
            },
          },
        },
      },
    });
    if (!cohort) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ cohort });
  } catch (err) {
    if (err instanceof CollegeAuthError) return NextResponse.json({ error: err.code }, { status: err.status });
    return authErrorResponse(err);
  }
}
