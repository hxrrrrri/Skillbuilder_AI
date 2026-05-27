import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { comparePayload, getEmployerProfileBundle, summarizeEmployerProfile } from "@/lib/employer/profiles";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EMPLOYER_NAV } from "../_nav";

export const dynamic = "force-dynamic";

export default async function EmployerComparePage({
  searchParams,
}: {
  searchParams: { ids?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/employer/compare");
  const ids = (searchParams.ids ?? "").split(",").filter(Boolean).slice(0, 5);
  const bundles = await Promise.all(ids.map((id) => getEmployerProfileBundle(id)));
  const summaries = bundles.filter(Boolean).map((b) => summarizeEmployerProfile(b!));
  const rows = comparePayload(summaries);

  return (
    <RoleShell
      title="Compare candidates"
      subtitle="Side-by-side hiring evidence across public SkillProof profiles."
      navLinks={EMPLOYER_NAV}
      activeHref="/employer/search"
    >
      {rows.length < 2 ? (
        <ScaffoldNotice detail="Choose 2-5 profiles from search results or a shortlist to compare." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{rows.length} profile comparison</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-4">Signal</th>
                    {rows.map((r) => (
                      <th key={r.profile_id} className="py-2 pr-4">
                        <Link href={`/employer/candidates/${r.profile_id}`} className="text-ink hover:text-accent">{r.candidate}</Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <CompareRow label="Overall" values={rows.map((r) => r.score ?? "not measured")} />
                  <CompareRow label="Role fit" values={rows.map((r) => r.role_fit ?? "—")} />
                  <CompareRow label="Recommendation" values={rows.map((r) => r.recommendation.replace(/_/g, " "))} />
                  <CompareRow label="Testing" values={rows.map((r) => r.testing ?? "not measured")} />
                  <CompareRow label="Debugging" values={rows.map((r) => r.debugging ?? "not measured")} />
                  <CompareRow label="Communication" values={rows.map((r) => r.communication ?? "not measured")} />
                  <CompareRow label="AI collaboration" values={rows.map((r) => r.ai_collab ?? "not measured")} />
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-muted">Verified skills</td>
                    {rows.map((r) => (
                      <td key={r.profile_id} className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {r.verified_skills.length ? r.verified_skills.map((s) => <Badge key={s}>{s}</Badge>) : <span className="text-muted">—</span>}
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-muted">Proof strength</td>
                    {rows.map((r) => (
                      <td key={r.profile_id} className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={r.proof_strength.ownership === "verified" ? "good" : "warn"}>{r.proof_strength.ownership}</Badge>
                          {r.proof_strength.interview_verified && <Badge tone="good">interview</Badge>}
                          {r.proof_strength.terminal_proof && <Badge tone="good">terminal</Badge>}
                          {r.proof_strength.mock_or_heuristic && <Badge tone="warn">mock / heuristic</Badge>}
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-muted">Biggest risks</td>
                    {rows.map((r) => (
                      <td key={r.profile_id} className="py-3 pr-4 align-top">
                        <ul className="list-disc pl-4 text-xs text-muted">
                          {r.biggest_risks.length ? r.biggest_risks.slice(0, 3).map((risk) => <li key={risk}>{risk}</li>) : <li>No persisted risks</li>}
                        </ul>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </RoleShell>
  );
}

function CompareRow({ label, values }: { label: string; values: Array<string | number> }) {
  return (
    <tr>
      <td className="py-3 pr-4 font-semibold text-muted">{label}</td>
      {values.map((value, i) => (
        <td key={i} className="py-3 pr-4 text-ink">{value}</td>
      ))}
    </tr>
  );
}
