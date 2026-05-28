import Link from "next/link";
import { prisma } from "@/lib/db";
import { ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { safeJsonParse } from "@/lib/utils";
import { fetchPublicProfileBundles, summarizeEmployerProfile } from "@/lib/employer/profiles";

export const dynamic = "force-dynamic";

export default async function TalentPoolSharePage({ params }: { params: { token: string } }) {
  const share = await prisma.talentPoolShare.findUnique({ where: { token: params.token }, include: { tenant: true } });

  if (!share) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <ScaffoldNotice title="Share unavailable" detail="This talent-pool link does not exist." />
      </main>
    );
  }
  if (share.expiresAt && share.expiresAt < new Date()) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <ScaffoldNotice title="Share expired" detail="Ask the college to generate a new read-only talent-pool link." />
      </main>
    );
  }

  const filters = safeJsonParse<{ minScore?: number | null }>(share.filters, {});
  const candidateIds = share.cohortId
    ? (await prisma.cohortStudent.findMany({ where: { cohortId: share.cohortId, cohort: { tenantId: share.tenantId } }, select: { candidateId: true } })).map((s) => s.candidateId)
    : null;
  const bundles = await fetchPublicProfileBundles(
    {
      run: {
        tenantId: share.tenantId,
        status: "completed",
        ...(candidateIds ? { candidateId: { in: candidateIds } } : {}),
      },
    },
    50,
  );
  const summaries = bundles
    .map(summarizeEmployerProfile)
    .filter((profile) => (filters.minScore == null ? true : (profile.overallScore ?? -1) >= filters.minScore));

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <header>
        <h1 className="font-display text-3xl text-ink">{share.tenant.name} talent pool</h1>
        <p className="mt-1 text-sm text-muted">Read-only public profiles shared by the college tenant.</p>
      </header>
      {summaries.length === 0 ? (
        <ScaffoldNotice detail="No public profiles match this share link's filters yet." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {summaries.map((profile) => (
            <Card key={profile.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <CardTitle>{profile.candidateName}</CardTitle>
                  <Badge tone={profile.recommendation === "strong" ? "good" : profile.recommendation === "risky" ? "bad" : "warn"}>
                    {profile.recommendation.replace(/_/g, " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardBody>
                <p className="font-mono text-xs text-muted">{profile.repo} · {profile.targetRole}</p>
                <p className="mt-3 font-display text-4xl text-ink">{profile.overallScore ?? "not scored"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={profile.ownership === "verified" ? "good" : "warn"}>{profile.ownership}</Badge>
                  <Badge tone={profile.interviewVerified ? "good" : "default"}>interview {profile.interviewVerified ? "verified" : "pending"}</Badge>
                  {profile.mockOrHeuristic && <Badge tone="bad">legacy unverified</Badge>}
                </div>
                <Link href={`/profile/${profile.slug}`} className="mt-4 inline-flex text-sm font-semibold text-accent hover:text-ink">
                  Open public profile
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
