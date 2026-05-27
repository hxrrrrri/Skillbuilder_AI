import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/candidate/dashboard", label: "Dashboard" },
  { href: "/candidate/new-verification", label: "New verification" },
  { href: "/candidate/runs", label: "Runs" },
  { href: "/candidate/profile", label: "Public profile" },
];

export default async function CandidateDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/candidate/dashboard");

  const candidate = await prisma.candidate.findUnique({ where: { userId: user.id } });
  const runs = candidate
    ? await prisma.analysisRun.findMany({
        where: { candidateId: candidate.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { repository: true },
      })
    : await prisma.analysisRun.findMany({
        where: { createdByUserId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { repository: true },
      });

  const completed = runs.filter((r) => r.status === "completed");
  const latest = completed[0] ?? runs[0] ?? null;
  const publicProfile = candidate
    ? await prisma.publicProfile.findFirst({
        where: { candidateId: candidate.id, visibility: "public" },
        orderBy: { createdAt: "desc" },
      })
    : null;

  return (
    <RoleShell
      title={`Welcome, ${user.name.split(" ")[0]}`}
      subtitle="Run verifications, manage your public profile, and track skill improvement."
      navLinks={NAV}
      activeHref="/candidate/dashboard"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">SkillProof score</p>
            <p className="mt-2 font-display text-4xl text-ink">
              {latest?.overallScore ?? "—"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {latest ? `Verification: ${latest.verificationLevel.replace("_", " ")}` : "No verifications yet."}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Public profile</p>
            <p className="mt-2 font-display text-2xl text-ink">
              {publicProfile ? "Published" : "Not published"}
            </p>
            {publicProfile && (
              <Link
                href={`/profile/${publicProfile.slug}`}
                className="mt-1 inline-block text-xs text-accent hover:underline"
              >
                View public profile →
              </Link>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Runs total</p>
            <p className="mt-2 font-display text-4xl text-ink">{runs.length}</p>
            <p className="mt-1 text-xs text-muted">{completed.length} completed</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Recent runs</CardTitle>
          <Link href="/candidate/new-verification" className="text-xs text-accent hover:underline">
            Start a new verification →
          </Link>
        </CardHeader>
        <CardBody>
          {runs.length === 0 ? (
            <ScaffoldNotice
              detail="No verification runs yet. Start one by pasting a public GitHub repository."
            />
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link
                      href={`/mission/${r.id}`}
                      className="font-mono text-sm text-ink hover:text-accent"
                    >
                      {r.repository.owner}/{r.repository.repoName}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted">
                      {r.targetRole} · {new Date(r.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{r.status}</Badge>
                    {r.overallScore != null && (
                      <span className="font-mono text-sm text-ink">{r.overallScore}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}
