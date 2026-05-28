import { RoleShell } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COLLEGE_NAV } from "../_nav";
import { getCollegePageContext } from "../_auth";

export const dynamic = "force-dynamic";

export default async function CollegeSettingsPage() {
  const { user, scope, noTenant } = await getCollegePageContext("/college/settings");

  return (
    <RoleShell
      title="College Settings"
      subtitle="Tenant-scoped controls and read-only proof boundaries."
      navLinks={COLLEGE_NAV}
      activeHref="/college/settings"
    >
      <Card>
        <CardHeader>
          <CardTitle>Tenant Scope</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase text-muted">Signed in as</div>
            <div className="mt-1 text-ink">{user.email}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted">Role</div>
            <Badge className="mt-1">{user.role}</Badge>
          </div>
          <div>
            <div className="text-xs uppercase text-muted">Active tenant</div>
            <div className="mt-1 text-ink">{scope?.tenantId ?? (noTenant ? "No college tenant assigned" : "Platform admin")}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted">Memberships</div>
            <div className="mt-1 font-mono text-xs text-muted">{user.tenantIds.length ? user.tenantIds.join(", ") : "none"}</div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proof Boundary</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-muted">
          <p>College users can read tenant-scoped student verification summaries and reports.</p>
          <p>College users cannot submit interviews, AI challenges, ownership checks, terminal commands, or profile publish actions for a candidate.</p>
        </CardBody>
      </Card>
    </RoleShell>
  );
}
