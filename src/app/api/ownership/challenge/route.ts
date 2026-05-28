import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { parseRepoUrl } from "@/lib/utils";
import { issueOwnershipChallengeToken } from "@/lib/ownership-challenge";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  repo_url: z.string().url(),
  github_username: z.string().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json({ error: "invalid_body", detail: err?.message }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!isAdminRole(user.role) && user.role !== "candidate") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = parseRepoUrl(body.repo_url);
  if (!parsed) return NextResponse.json({ error: "invalid_repo_url" }, { status: 400 });

  const challengeId = randomUUID();
  const issued = issueOwnershipChallengeToken({
    challengeId,
    userId: user.id,
    owner: parsed.owner,
    repo: parsed.repo,
  });

  const challenge = await prisma.ownershipChallenge.create({
    data: {
      id: challengeId,
      userId: user.id,
      repoOwner: parsed.owner,
      repoName: parsed.repo,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
    },
  });

  await writeAuditLog({
    action: "ownership.challenge.issued",
    actorUserId: user.id,
    tenantId: user.primaryTenantId ?? null,
    targetType: "OwnershipChallenge",
    targetId: challenge.id,
    metadata: {
      repo: `${parsed.owner}/${parsed.repo}`,
      github_username: body.github_username ?? null,
      expires_at: issued.expiresAt.toISOString(),
    },
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  }).catch(() => {});

  return NextResponse.json({
    challenge_id: challenge.id,
    token: issued.token,
    expires_at: issued.expiresAt.toISOString(),
    repo: { owner: parsed.owner, name: parsed.repo },
    placement: {
      file: ".skillproof-verify.json",
      json: {
        provider: "skillproof.ai",
        github_username: body.github_username ?? "",
        repo: `${parsed.owner}/${parsed.repo}`,
        ownership_challenge_id: challenge.id,
        token: issued.token,
      },
      readme_line: `SkillProof ownership challenge: ${issued.token}`,
    },
  });
}
