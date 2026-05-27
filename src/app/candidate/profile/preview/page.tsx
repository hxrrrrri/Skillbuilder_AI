import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CANDIDATE_NAV } from "../../_nav";

export const dynamic = "force-dynamic";

export default async function ProfilePreviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/candidate/profile/preview");

  const profiles = await prisma.publicProfile.findMany({
    where: { ownerUserId: user.id },
    orderBy: { createdAt: "desc" },
    include: { run: { include: { repository: true } } },
  });

  return (
    <RoleShell
      title="Preview as employer"
      subtitle="Open any of your profiles in the exact view an employer sees. Private and unlisted shown only to you."
      navLinks={CANDIDATE_NAV}
      activeHref="/candidate/profile"
    >
      {profiles.length === 0 ? (
        <Card>
          <CardBody>
            <ScaffoldNotice detail="No profiles published yet. Publish one from a completed mission first." />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your profiles</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-border">
              {profiles.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link href={`/profile/${p.slug}`} className="font-mono text-sm text-ink hover:text-accent">
                      /{p.slug}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted">
                      {p.run.repository.owner}/{p.run.repository.repoName} ·{" "}
                      <Badge tone={p.visibility === "public" ? "good" : p.visibility === "unlisted" ? "warn" : "bad"}>
                        {p.visibility}
                      </Badge>{" "}
                      · {new Date(p.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <Link
                    href={`/profile/${p.slug}`}
                    className="rounded-md border border-border bg-panel2 px-3 py-1 text-xs text-ink hover:border-accent/60 hover:text-accent"
                  >
                    Preview ↗
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </RoleShell>
  );
}
