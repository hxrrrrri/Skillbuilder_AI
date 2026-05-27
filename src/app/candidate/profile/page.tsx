import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CANDIDATE_NAV } from "../_nav";
import { ProfileRowActions } from "@/components/profile-row-actions";
import { signBadge } from "@/lib/badge-signing";

function withSig(url: string, slug: string): string {
  const s = signBadge(slug);
  return s ? `${url}?sig=${s}` : url;
}

export const dynamic = "force-dynamic";

export default async function CandidateProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/candidate/profile");

  const profiles = await prisma.publicProfile.findMany({
    where: { ownerUserId: user.id },
    orderBy: { createdAt: "desc" },
    include: { run: { include: { repository: true } } },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <RoleShell
      title="Your public profile"
      subtitle="Control visibility, copy share links, embed verified badges, or unpublish."
      navLinks={CANDIDATE_NAV}
      activeHref="/candidate/profile"
    >
      <Card>
        <CardHeader>
          <CardTitle>Published profiles</CardTitle>
        </CardHeader>
        <CardBody>
          {profiles.length === 0 ? (
            <ScaffoldNotice detail="No published profiles yet. Complete a verification run, then publish it from the mission page." />
          ) : (
            <ul className="divide-y divide-border">
              {profiles.map((p) => {
                const url = `${base}/profile/${p.slug}`;
                const svgUrl = withSig(`${base}/api/badge/${p.slug}.svg`, p.slug);
                return (
                  <li key={p.id} className="space-y-2 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/profile/${p.slug}`} className="font-mono text-sm text-ink hover:text-accent">
                        /{p.slug}
                      </Link>
                      <span className="text-xs text-muted">
                        {p.run.repository.owner}/{p.run.repository.repoName} ·{" "}
                        {new Date(p.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <ProfileRowActions
                      profileId={p.id}
                      slug={p.slug}
                      url={url}
                      svgUrl={svgUrl}
                      initialVisibility={p.visibility as "public" | "unlisted" | "private"}
                      initialIncludeTerminalProof={p.includeTerminalProof}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}
