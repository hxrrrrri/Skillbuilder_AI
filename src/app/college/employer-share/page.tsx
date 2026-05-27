import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { safeJsonParse } from "@/lib/utils";
import { COLLEGE_NAV } from "../_nav";
import { getCollegePageContext } from "../_auth";
import { ShareForm } from "./share-form";

export const dynamic = "force-dynamic";

export default async function CollegeEmployerSharePage() {
  const { scope, noTenant } = await getCollegePageContext("/college/employer-share");
  if (noTenant || !scope) {
    return (
      <RoleShell title="Share" subtitle="Generate tokenized read-only talent pool links." navLinks={COLLEGE_NAV} activeHref="/college/employer-share">
        <ScaffoldNotice title="No tenant" detail="Your account is not associated with a college tenant yet." />
      </RoleShell>
    );
  }

  const [cohorts, shares] = await Promise.all([
    prisma.cohort.findMany({ where: { tenantId: scope.tenantId }, orderBy: { createdAt: "desc" } }),
    prisma.talentPoolShare.findMany({ where: { tenantId: scope.tenantId }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);

  return (
    <RoleShell title="Share" subtitle="Generate tokenized read-only talent pool links." navLinks={COLLEGE_NAV} activeHref="/college/employer-share">
      <Card>
        <CardHeader>
          <CardTitle>New talent pool link</CardTitle>
        </CardHeader>
        <CardBody>
          <ShareForm cohorts={cohorts.map((c) => ({ id: c.id, name: c.name }))} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent links</CardTitle>
        </CardHeader>
        <CardBody>
          {shares.length === 0 ? (
            <ScaffoldNotice detail="No share links have been created yet." />
          ) : (
            <ul className="divide-y divide-border">
              {shares.map((share) => {
                const filters = safeJsonParse<{ minScore?: number | null }>(share.filters, {});
                const cohort = cohorts.find((c) => c.id === share.cohortId);
                return (
                  <li key={share.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-mono text-xs text-ink">/share/talent-pool/{share.token.slice(0, 10)}...</p>
                      <p className="text-xs text-muted">
                        {cohort?.name ?? "All cohorts"} · min score {filters.minScore ?? "any"} · expires {share.expiresAt?.toLocaleDateString() ?? "never"}
                      </p>
                    </div>
                    <Badge tone={share.expiresAt && share.expiresAt < new Date() ? "bad" : "good"}>
                      {share.expiresAt && share.expiresAt < new Date() ? "expired" : "active"}
                    </Badge>
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
