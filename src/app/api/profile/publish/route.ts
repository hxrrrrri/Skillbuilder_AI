import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { evaluateRunMutationAccess } from "@/lib/auth/guards-api";
import { getPublicProfilePublishBlockers } from "@/lib/profile-publish-gates";
import { revalidatePublicProfile } from "@/lib/profile-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  run_id: z.string(),
  name: z.string().min(2).max(80).optional(),
  visibility: z.enum(["public", "unlisted", "private"]),
  include_terminal_proof: z.boolean().default(false),
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
    include: { repository: true, candidate: true, scores: true },
  });
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });

  const sessionUser = await getCurrentUser();
  const decision = evaluateRunMutationAccess(sessionUser, {
    candidateId: run.candidateId,
    createdByUserId: run.createdByUserId,
    tenantId: run.tenantId,
    candidateUserId: run.candidate?.userId ?? null,
  }, "publish_profile");
  if (!decision.ok) {
    await writeAuditLog({
      action: "profile.publish.denied",
      actorUserId: sessionUser?.id ?? null,
      tenantId: run.tenantId ?? null,
      targetType: "run",
      targetId: run.id,
      metadata: { reason: decision.reason },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    }).catch(() => {});
    return decision.response;
  }

  if (body.visibility !== "private") {
    const blockers = getPublicProfilePublishBlockers(run);
    if (blockers.length) {
      await writeAuditLog({
        action: "profile.publish.blocked",
        actorUserId: sessionUser?.id ?? null,
        tenantId: run.tenantId ?? sessionUser?.primaryTenantId ?? null,
        targetType: "run",
        targetId: run.id,
        metadata: { visibility: body.visibility, blockers },
        ip: req.headers.get("x-forwarded-for") ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
      }).catch(() => {});
      return NextResponse.json(
        {
          error: "public_profile_blocked",
          reason: "Public and unlisted profiles require evidence-backed, validated, provider-backed scores.",
          blockers,
          allowed_visibility: ["private"],
        },
        { status: 409 },
      );
    }
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
      includeTerminalProof: body.include_terminal_proof,
    },
  });

  // Cover slug reuse: if this slug was cached from a prior profile, drop it.
  revalidatePublicProfile(profile.slug);

  await writeAuditLog({
    action: "profile.publish",
    actorUserId: sessionUser?.id ?? null,
    tenantId: run.tenantId ?? sessionUser?.primaryTenantId ?? null,
    targetType: "profile",
    targetId: profile.id,
    metadata: { run_id: run.id, slug, visibility: body.visibility, include_terminal_proof: body.include_terminal_proof },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.json({ slug: profile.slug, url: `${base}/profile/${profile.slug}` });
}
