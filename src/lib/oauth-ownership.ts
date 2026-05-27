import { prisma } from "@/lib/db";

export type OwnershipBlob = {
  owner_match?: boolean;
  repo_token_verified?: boolean;
  self_declared?: boolean;
  github_oauth_owner_match?: boolean;
  gh_user?: string | null;
  confidence?: "verified" | "self_declared" | "unverified";
  verification_method?: string;
};

function safe(s: string | null): OwnershipBlob {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/**
 * After a candidate links GitHub via OAuth, walk their runs and promote only
 * rows where the verified GitHub login matches the repository owner. OAuth
 * email/account linking by itself is never treated as repo ownership proof.
 */
export async function upgradeOwnershipFromOauth(opts: {
  userId: string;
  githubLogin: string;
}): Promise<number> {
  if (!opts.githubLogin) return 0;
  const candidate = await prisma.candidate.findUnique({ where: { userId: opts.userId } });
  if (!candidate) return 0;

  const runs = await prisma.analysisRun.findMany({
    where: { candidateId: candidate.id, ownershipStatus: { not: null } },
    select: { id: true, ownershipStatus: true, repository: { select: { owner: true } } },
  });

  let upgraded = 0;
  for (const run of runs) {
    const blob = safe(run.ownershipStatus);
    const repoOwner = run.repository.owner.toLowerCase();
    if (
      blob.confidence !== "verified" &&
      repoOwner === opts.githubLogin.toLowerCase()
    ) {
      const next: OwnershipBlob = {
        ...blob,
        github_oauth_owner_match: true,
        gh_user: opts.githubLogin,
        confidence: "verified",
        verification_method: "github_oauth_repo_owner_match",
      };
      await prisma.analysisRun.update({
        where: { id: run.id },
        data: { ownershipStatus: JSON.stringify(next) },
      });
      upgraded += 1;
    }
  }
  return upgraded;
}
