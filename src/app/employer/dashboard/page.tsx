import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/employer/dashboard", label: "Dashboard" },
  { href: "/employer/search", label: "Search", badge: "soon" },
  { href: "/employer/candidates", label: "Candidates" },
];

export default async function EmployerDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/employer/dashboard");

  const verifiedProfiles = await prisma.publicProfile.findMany({
    where: { visibility: "public" },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      candidate: true,
      run: { include: { repository: true } },
    },
  });

  return (
    <RoleShell
      title={`Verified talent feed`}
      subtitle="Recently verified candidates with public, evidence-backed profiles."
      navLinks={NAV}
      activeHref="/employer/dashboard"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Public verified profiles</p>
            <p className="mt-2 font-display text-4xl text-ink">{verifiedProfiles.length}</p>
            <p className="mt-1 text-xs text-muted">From all candidates across the platform.</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Shortlist</p>
            <p className="mt-2 font-display text-4xl text-ink">0</p>
            <p className="mt-1 text-xs text-muted">Shortlist & saved searches arrive in the next slice.</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Compare</p>
            <p className="mt-2 font-display text-4xl text-ink">—</p>
            <p className="mt-1 text-xs text-muted">Side-by-side compare arrives in the next slice.</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent verified candidates</CardTitle>
        </CardHeader>
        <CardBody>
          {verifiedProfiles.length === 0 ? (
            <ScaffoldNotice detail="No public profiles published yet. As candidates verify their work, they will appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {verifiedProfiles.map((p) => {
                const r = p.run;
                return (
                  <li key={p.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Link href={`/profile/${p.slug}`} className="font-display text-lg text-ink hover:text-accent">
                        {p.candidate?.name ?? "Anonymous candidate"}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">
                        {r.targetRole} · {r.repository.owner}/{r.repository.repoName}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.overallScore != null && <Badge tone="accent">{r.overallScore}</Badge>}
                      <Badge tone={r.verificationLevel === "repo_interview_verified" ? "good" : "default"}>
                        {r.verificationLevel.replace("_", " ")}
                      </Badge>
                    </div>
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
