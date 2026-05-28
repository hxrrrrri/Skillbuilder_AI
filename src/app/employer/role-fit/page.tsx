import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { RoleShell } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EMPLOYER_NAV } from "../_nav";
import { fetchPublicProfileBundles, summarizeEmployerProfile } from "@/lib/employer/profiles";

export const dynamic = "force-dynamic";

function tokenize(input: string): string[] {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .filter((t) => t.length >= 3),
    ),
  );
}

export default async function EmployerRoleFitPage({ searchParams }: { searchParams: { jd?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/employer/role-fit");

  const jd = searchParams.jd ?? "";
  const terms = tokenize(jd);
  const summaries = (await fetchPublicProfileBundles({ run: { status: "completed" } }, 50)).map(summarizeEmployerProfile);
  const ranked = summaries
    .map((s) => {
      const haystack = `${s.targetRole} ${s.verifiedSkills.join(" ")} ${s.repo}`.toLowerCase();
      const matched = terms.filter((t) => haystack.includes(t));
      const score = (s.overallScore ?? 0) + matched.length * 4 + (s.interviewVerified ? 5 : 0) + (s.ownership === "verified" ? 5 : 0);
      const band = score >= 85 ? "Strong shortlist" : score >= 65 ? "Consider with reservations" : "Needs more proof";
      return { ...s, matched, fitScore: score, band };
    })
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 15);

  return (
    <RoleShell
      title="Role Fit"
      subtitle="Rank public, shared profiles against a job description using verified skills only."
      navLinks={EMPLOYER_NAV}
      activeHref="/employer/role-fit"
    >
      <Card>
        <CardHeader>
          <CardTitle>Job Description</CardTitle>
        </CardHeader>
        <CardBody>
          <form className="space-y-3">
            <textarea
              name="jd"
              defaultValue={jd}
              className="min-h-36 w-full rounded-md border border-border bg-panel2 p-3 text-sm text-ink"
              placeholder="Paste role requirements, stack, and must-have signals."
            />
            <Button type="submit">Rank profiles</Button>
          </form>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {["Strong shortlist", "Consider with reservations", "Needs more proof"].map((band) => (
          <Card key={band}>
            <CardHeader>
              <CardTitle>{band}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {ranked.filter((r) => r.band === band).length === 0 ? (
                <p className="text-sm text-muted">No profiles in this band for the current filters.</p>
              ) : (
                ranked
                  .filter((r) => r.band === band)
                  .map((r) => (
                    <div key={r.id} className="rounded-md border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link href={`/employer/candidates/${r.id}`} className="font-semibold text-ink hover:text-accent">
                            {r.candidateName}
                          </Link>
                          <div className="mt-1 text-xs text-muted">{r.repo} · {r.targetRole}</div>
                        </div>
                        <Badge tone={r.band === "Strong shortlist" ? "good" : r.band === "Needs more proof" ? "warn" : "default"}>
                          {r.overallScore ?? "—"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.matched.slice(0, 5).map((m) => <Badge key={m}>{m}</Badge>)}
                        {r.ownership !== "verified" && <Badge tone="warn">ownership proof missing</Badge>}
                        {!r.interviewVerified && <Badge tone="warn">interview pending</Badge>}
                      </div>
                    </div>
                  ))
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </RoleShell>
  );
}
