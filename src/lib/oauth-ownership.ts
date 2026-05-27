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
 * After a candidate links GitHub via OAuth, walk their runs and promote any
 * ownership row whose self-declared gh_user matches the verified login.
 * Scaffold: only flips the JSON flag + confidence; does not re-score.
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
    const ghUser = (blob.gh_user ?? "").toLowerCase();
    const repoOwner = run.repository.owner.toLowerCase();
    if (
      blob.confidence !== "verified" &&
      (ghUser === opts.githubLogin.toLowerCase() || repoOwner === opts.githubLogin.toLowerCase())
    ) {
      const next: OwnershipBlob = {
        ...blob,
        github_oauth_owner_match: true,
        confidence: "verified",
        verification_method: "github_oauth_owner_match",
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
