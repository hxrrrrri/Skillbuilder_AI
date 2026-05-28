import { requireAdminPage } from "@/lib/auth/guards";
import { RoleShell } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV } from "../_nav";
import { POLICY_ALLOWLIST } from "@/lib/local-runner/policies";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  await requireAdminPage("/admin/security");
  const terminalEnabled = process.env.NODE_ENV !== "production" || process.env.SKILLPROOF_TERMINAL_ENABLED === "1";

  return (
    <RoleShell
      title="Security"
      subtitle="Terminal policy, provider execution locks, and fixture-data state."
      navLinks={ADMIN_NAV}
      activeHref="/admin/security"
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Terminal Policy</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm text-muted">
            <Badge tone={terminalEnabled ? "warn" : "good"}>{terminalEnabled ? "terminal can run" : "production terminal disabled"}</Badge>
            <p>Commands require authentication, run ownership or admin override, a run id, workspace jail, allowlist, timeout, redaction, output hash, and audit logs.</p>
            <p>Install and script commands require explicit second-action approval.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Provider Lock</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm text-muted">
            <Badge tone="good">admin-only tests</Badge>
            <p>Provider health tests and local provider detection require admin API access. Verification start is blocked until required providers pass JSON contract health checks.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fixture Data</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm text-muted">
            <Badge tone="good">production route removed</Badge>
            <p>Fixture-like verification data is not exposed through application routes, public profiles, employer dashboards, or college dashboards.</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Allowed Commands</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {POLICY_ALLOWLIST.map((cmd) => <Badge key={cmd}>{cmd}</Badge>)}
          </div>
        </CardBody>
      </Card>
    </RoleShell>
  );
}
