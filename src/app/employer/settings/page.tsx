import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { RoleShell } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EMPLOYER_NAV } from "../_nav";

export const dynamic = "force-dynamic";

export default async function EmployerSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/employer/settings");

  return (
    <RoleShell
      title="Employer Settings"
      subtitle="Read-only hiring workspace settings for the current account."
      navLinks={EMPLOYER_NAV}
      activeHref="/employer/settings"
    >
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase text-muted">Name</div>
            <div className="mt-1 text-ink">{user.name}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted">Email</div>
            <div className="mt-1 text-ink">{user.email}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted">Role</div>
            <Badge className="mt-1">{user.role}</Badge>
          </div>
          <div>
            <div className="text-xs uppercase text-muted">Tenant scope</div>
            <div className="mt-1 font-mono text-xs text-muted">{user.tenantIds.length ? user.tenantIds.join(", ") : "public profiles only"}</div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Access</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-muted">
          <p>Employer views use public or explicitly shared profile data only.</p>
          <p>Raw provider output, raw context packs, private terminal transcripts, and private interview answers are not exposed here.</p>
        </CardBody>
      </Card>
    </RoleShell>
  );
}
