import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/employer/dashboard", label: "Dashboard" },
  { href: "/employer/search", label: "Search", badge: "soon" },
  { href: "/employer/candidates", label: "Candidates" },
];

export default async function EmployerCandidatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/employer/candidates");

  const profiles = await prisma.publicProfile.findMany({
    where: { visibility: "public" },
    orderBy: { createdAt: "desc" },
    include: { candidate: true, run: { include: { repository: true } } },
  });

  return (
    <RoleShell
      title="Verified candidates"
      subtitle="Browse public, evidence-backed candidate profiles."
      navLinks={NAV}
      activeHref="/employer/candidates"
    >
      {profiles.length === 0 ? (
        <ScaffoldNotice detail="No verified candidates yet. As candidates publish profiles, they will appear here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {profiles.map((p) => (
            <Card key={p.id}>
              <CardBody>
                <Link href={`/profile/${p.slug}`} className="font-display text-lg text-ink hover:text-accent">
                  {p.candidate?.name ?? "Anonymous candidate"}
                </Link>
                <div className="mt-1 text-xs text-muted">{p.run.targetRole}</div>
                <div className="mt-2 flex items-center gap-2">
                  {p.run.overallScore != null && <Badge tone="accent">Score {p.run.overallScore}</Badge>}
                  <Badge tone={p.run.verificationLevel === "repo_interview_verified" ? "good" : "default"}>
                    {p.run.verificationLevel.replace("_", " ")}
                  </Badge>
                </div>
                <div className="mt-3 text-xs font-mono text-muted">
                  {p.run.repository.owner}/{p.run.repository.repoName}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </RoleShell>
  );
}
