import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CANDIDATE_NAV } from "../_nav";
import { BadgeEmbedSnippets } from "@/components/badge-embed";
import { signBadge } from "@/lib/badge-signing";

export const dynamic = "force-dynamic";

export default async function BadgesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/candidate/badges");

  const profiles = await prisma.publicProfile.findMany({
    where: { ownerUserId: user.id, visibility: { not: "private" } },
    orderBy: { createdAt: "desc" },
    include: {
      run: { select: { overallScore: true, verificationLevel: true, completedAt: true, targetRole: true } },
    },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <RoleShell
      title="Verification badges"
      subtitle="Embed verified-score badges in your README, LinkedIn, or personal site."
      navLinks={CANDIDATE_NAV}
      activeHref="/candidate/badges"
    >
      {profiles.length === 0 ? (
        <Card>
          <CardBody>
            <ScaffoldNotice detail="No public profiles yet. Publish a run from its mission page first." />
          </CardBody>
        </Card>
      ) : (
        profiles.map((p) => {
          const profileUrl = `${base}/profile/${p.slug}`;
          const sig = signBadge(p.slug);
          const qs = sig ? `?sig=${sig}` : "";
          const svgUrl = `${base}/api/badge/${p.slug}.svg${qs}`;
          const jsonUrl = `${base}/api/badge/${p.slug}.json${qs}`;
          const lastVerified = p.run.completedAt ?? p.createdAt;
          return (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>
                  <Link href={profileUrl} className="font-mono text-ink hover:text-accent">
                    /{p.slug}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={p.run.verificationLevel === "repo_interview_verified" ? "good" : "default"}>
                    {p.run.verificationLevel === "repo_interview_verified"
                      ? "Repo + Interview verified"
                      : "Repo-only verified"}
                  </Badge>
                  {p.run.overallScore != null && <Badge tone="accent">{p.run.overallScore}/100</Badge>}
                  <Badge>{p.run.targetRole}</Badge>
                  <span className="text-muted">
                    last verified: {new Date(lastVerified).toLocaleDateString()}
                  </span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={svgUrl} alt={`SkillProof badge for ${p.slug}`} className="h-7" />
                <BadgeEmbedSnippets slug={p.slug} profileUrl={profileUrl} svgUrl={svgUrl} jsonUrl={jsonUrl} />
              </CardBody>
            </Card>
          );
        })
      )}
    </RoleShell>
  );
}
