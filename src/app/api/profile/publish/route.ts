import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { isAdminRole } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  run_id: z.string(),
  name: z.string().min(2).max(80).optional(),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const run = await prisma.analysisRun.findUnique({
    where: { id: body.run_id },
    include: { repository: true, candidate: true },
  });
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  if (run.status !== "completed") {
    return NextResponse.json({ error: "run_incomplete", status: run.status }, { status: 409 });
  }

  const sessionUser = await getCurrentUser();
  const isOwner =
    !!sessionUser &&
    (run.createdByUserId === sessionUser.id ||
      (run.candidate?.userId && run.candidate.userId === sessionUser.id));
  const isAnonymousRun = !run.createdByUserId && !run.candidate?.userId;

  if (!isOwner && !isAnonymousRun && (!sessionUser || !isAdminRole(sessionUser.role))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const baseSlug = slugify(
    `${body.name ?? run.candidate?.name ?? run.repository.owner}-${run.repository.repoName}`,
  );
  let slug = baseSlug || "skillproof";
  let n = 1;
  while (await prisma.publicProfile.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${n++}`;
  }

  const profile = await prisma.publicProfile.create({
    data: {
      runId: run.id,
      candidateId: run.candidateId ?? null,
      ownerUserId: sessionUser?.id ?? run.candidate?.userId ?? null,
      slug,
      visibility: body.visibility,
    },
  });

  await writeAuditLog({
    action: "profile.publish",
    actorUserId: sessionUser?.id ?? null,
    tenantId: run.tenantId ?? sessionUser?.primaryTenantId ?? null,
    targetType: "profile",
    targetId: profile.id,
    metadata: { run_id: run.id, slug, visibility: body.visibility },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.json({ slug: profile.slug, url: `${base}/profile/${profile.slug}` });
}
