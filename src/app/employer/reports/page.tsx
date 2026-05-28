import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { RoleShell } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EMPLOYER_NAV } from "../_nav";
import { fetchPublicProfileBundles, summarizeEmployerProfile } from "@/lib/employer/profiles";

export const dynamic = "force-dynamic";

export default async function EmployerReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/employer/reports");

  const profiles = (await fetchPublicProfileBundles({ run: { status: "completed" } }, 40)).map(summarizeEmployerProfile);

  return (
    <RoleShell
      title="Reports"
      subtitle="Public-safe report downloads. Employers never receive raw run traces."
      navLinks={EMPLOYER_NAV}
      activeHref="/employer/reports"
    >
      <Card>
        <CardHeader>
          <CardTitle>Available Public Reports</CardTitle>
        </CardHeader>
        <CardBody>
          {profiles.length === 0 ? (
            <p className="text-sm text-muted">No public reports are available yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {profiles.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Link href={`/employer/candidates/${p.id}`} className="font-semibold text-ink hover:text-accent">
                      {p.candidateName}
                    </Link>
                    <div className="mt-1 text-xs text-muted">{p.repo} · {p.targetRole}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.trustBadges.slice(0, 4).map((b) => <Badge key={b}>{b}</Badge>)}
                    </div>
                  </div>
                  <a className="rounded-md border border-border px-3 py-2 text-sm text-ink hover:border-accent/60" href={`/api/report/export?profile_id=${p.id}`}>
                    Download Report.md
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}
