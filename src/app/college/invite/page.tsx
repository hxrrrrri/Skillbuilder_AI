import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COLLEGE_NAV } from "../_nav";
import { getCollegePageContext } from "../_auth";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function CollegeInvitePage() {
  const { scope, noTenant } = await getCollegePageContext("/college/invite");
  if (noTenant || !scope) {
    return (
      <RoleShell title="Invites" subtitle="Create single-use tenant invite links." navLinks={COLLEGE_NAV} activeHref="/college/invite">
        <ScaffoldNotice title="No tenant" detail="Your account is not associated with a college tenant yet." />
      </RoleShell>
    );
  }

  const [cohorts, invites] = await Promise.all([
    prisma.cohort.findMany({ where: { tenantId: scope.tenantId }, orderBy: { createdAt: "desc" } }),
    prisma.tenantInvite.findMany({
      where: { tenantId: scope.tenantId },
      include: { cohort: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <RoleShell title="Invites" subtitle="Create single-use tenant invite links." navLinks={COLLEGE_NAV} activeHref="/college/invite">
      <Card>
        <CardHeader>
          <CardTitle>New invite</CardTitle>
        </CardHeader>
        <CardBody>
          <InviteForm cohorts={cohorts.map((c) => ({ id: c.id, name: c.name }))} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent invites</CardTitle>
        </CardHeader>
        <CardBody>
          {invites.length === 0 ? (
            <ScaffoldNotice detail="No invites have been generated for this tenant yet." />
          ) : (
            <ul className="divide-y divide-border">
              {invites.map((invite) => (
                <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm text-ink">{invite.email}</p>
                    <p className="font-mono text-xs text-muted">
                      {invite.role} {invite.cohort ? `· ${invite.cohort.name}` : ""} · expires {invite.expiresAt.toLocaleDateString()}
                    </p>
                  </div>
                  <Badge tone={invite.acceptedAt ? "good" : invite.expiresAt < new Date() ? "bad" : "warn"}>
                    {invite.acceptedAt ? "accepted" : invite.expiresAt < new Date() ? "expired" : "pending"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}
