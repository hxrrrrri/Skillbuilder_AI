import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/candidate/dashboard", label: "Dashboard" },
  { href: "/candidate/new-verification", label: "New verification" },
  { href: "/candidate/runs", label: "Runs" },
  { href: "/candidate/profile", label: "Public profile" },
];

export default async function CandidateProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/candidate/profile");

  const candidate = await prisma.candidate.findUnique({ where: { userId: user.id } });
  const profiles = candidate
    ? await prisma.publicProfile.findMany({
        where: { candidateId: candidate.id },
        orderBy: { createdAt: "desc" },
        include: { run: { include: { repository: true } } },
      })
    : [];

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <RoleShell
      title="Your public profile"
      subtitle="Control which verified profiles employers can see."
      navLinks={NAV}
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
                return (
                  <li key={p.id} className="flex items-center justify-between py-3">
                    <div>
                      <Link href={`/profile/${p.slug}`} className="font-mono text-sm text-ink hover:text-accent">
                        /{p.slug}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">
                        {p.run.repository.owner}/{p.run.repository.repoName} · {p.visibility} ·{" "}
                        {new Date(p.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-border bg-panel2 px-3 py-1 text-xs text-ink hover:border-accent/60 hover:text-accent"
                    >
                      Open
                    </a>
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
