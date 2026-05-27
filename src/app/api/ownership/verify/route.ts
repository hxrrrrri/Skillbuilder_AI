import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getFile } from "@/lib/github";
import { safeJsonParse } from "@/lib/utils";
import type { OwnershipStatus } from "@/agents/types";
import { getCurrentUser } from "@/lib/auth/session";
import { evaluateRunAccess } from "@/lib/auth/guards-api";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  run_id: z.string(),
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
    include: { candidate: true, repository: true },
  });
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });

  // Only authorized users may trigger ownership verification for a run.
  const user = await getCurrentUser();
  const decision = evaluateRunAccess(user, {
    candidateId: run.candidateId,
    createdByUserId: run.createdByUserId,
    tenantId: run.tenantId,
    candidateUserId: run.candidate?.userId ?? null,
  });
  if (!decision.ok) {
    await writeAuditLog({
      action: "ownership.verify.denied",
      actorUserId: user?.id ?? null,
      tenantId: run.tenantId ?? null,
      targetType: "AnalysisRun",
      targetId: run.id,
      metadata: { reason: decision.reason },
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    }).catch(() => {});
    return decision.response;
  }

  const username = run.candidate?.githubUsername ?? null;
  const token = username ? `skillproof:${username}:${run.id}:${run.id.slice(-8)}` : null;
  const previous = safeJsonParse<OwnershipStatus | null>(run.ownershipStatus, null);
  let repoTokenVerified = false;
  const checkedFiles = ["README.md", "README", "readme.md", ".skillproof-verify.json"];

  if (token) {
    for (const file of checkedFiles) {
      const content = await getFile(run.repository.owner, run.repository.repoName, file).catch(() => null);
      if (content && content.toLowerCase().includes(token.toLowerCase())) {
        repoTokenVerified = true;
        break;
      }
    }
  }

  const ownerMatch = !!username && username.toLowerCase() === run.repository.owner.toLowerCase();
  const verified = ownerMatch || repoTokenVerified;
  const status: OwnershipStatus = {
    owner_match: ownerMatch,
    repo_token_verified: repoTokenVerified,
    collaborator_verified: previous?.collaborator_verified ?? false,
    self_declared: !verified && !!username,
    verification_method: ownerMatch ? "owner_match" : repoTokenVerified ? "repo_token_verified" : username ? "self_declared" : "unverified",
    verification_token: token,
    gh_user: previous?.gh_user ?? null,
    github_username: username,
    repo_owner: run.repository.owner,
    confidence: verified ? "verified" : username ? "self_declared" : "unverified",
    notes: verified
      ? [`Ownership verified by ${ownerMatch ? "repo owner username match" : "repo token"}.`]
      : token
        ? [`Token not found in README or .skillproof-verify.json. Checked: ${checkedFiles.join(", ")}.`]
        : ["No GitHub username supplied, so token verification is unavailable."],
  };

  await prisma.analysisRun.update({
    where: { id: run.id },
    data: { ownershipStatus: JSON.stringify(status) },
  });

  return NextResponse.json({ ownership_status: status });
}

