import Link from "next/link";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COLLEGE_NAV } from "../_nav";
import { getCollegePageContext } from "../_auth";
import { getPlacementReady } from "@/lib/college/tenant";

export const dynamic = "force-dynamic";

export default async function CollegePlacementReadyPage() {
  const { scope, noTenant } = await getCollegePageContext("/college/placement-ready");
  if (noTenant || !scope) {
    return (
      <RoleShell title="Placement" subtitle="Default placement-readiness checks for tenant runs." navLinks={COLLEGE_NAV} activeHref="/college/placement-ready">
        <ScaffoldNotice title="No tenant" detail="Your account is not associated with a college tenant yet." />
      </RoleShell>
    );
  }

  const rows = await getPlacementReady(scope);
  const ready = rows.filter((r) => r.ready);

  return (
    <RoleShell title="Placement" subtitle="Default placement-readiness checks for tenant runs." navLinks={COLLEGE_NAV} activeHref="/college/placement-ready">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Placement-ready students</CardTitle>
            <Badge tone={ready.length ? "good" : "warn"}>{ready.length}/{rows.length} ready</Badge>
          </div>
        </CardHeader>
        <CardBody>
          <ScaffoldNotice
            title="Threshold"
            detail="Default: overall score at least 70, verified ownership, interview verification, no high-risk security signal, terminal proof, and public profile published."
          />
          {rows.length === 0 ? (
            <div className="mt-4">
              <ScaffoldNotice detail="No completed tenant-scoped runs are available for placement readiness yet." />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {rows.map((row) => (
                <li key={row.run_id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Link href={`/mission/${row.run_id}`} className="text-sm font-semibold text-ink hover:text-accent">
                        {row.candidate_name}
                      </Link>
                      <p className="font-mono text-xs text-muted">{row.repo} · score {row.score ?? "not scored"}</p>
                    </div>
                    <Badge tone={row.ready ? "good" : "warn"}>{row.ready ? "ready" : "needs proof"}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(row.checks).map(([key, ok]) => (
                      <Badge key={key} tone={ok ? "good" : "default"}>{key.replace(/_/g, " ")}</Badge>
                    ))}
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
