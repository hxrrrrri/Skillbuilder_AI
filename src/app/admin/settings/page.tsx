import { requireAdminPage } from "@/lib/auth/guards";
import { RoleShell } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV } from "../_nav";

export const dynamic = "force-dynamic";

function envState(name: string, enabledWhenSet = true) {
  const set = !!process.env[name];
  return {
    label: set ? "set" : "unset",
    tone: (set === enabledWhenSet ? "good" : "warn") as "good" | "warn",
  };
}

export default async function AdminSettingsPage() {
  const user = await requireAdminPage("/admin/settings");
  const env = [
    ["DATABASE_URL", envState("DATABASE_URL")],
    ["NEXTAUTH_SECRET", envState("NEXTAUTH_SECRET")],
    ["ANTHROPIC_API_KEY", envState("ANTHROPIC_API_KEY")],
    ["GITHUB_TOKEN", envState("GITHUB_TOKEN")],
    ["SKILLPROOF_TERMINAL_ENABLED", { label: process.env.SKILLPROOF_TERMINAL_ENABLED === "1" ? "enabled" : "disabled", tone: process.env.SKILLPROOF_TERMINAL_ENABLED === "1" ? "warn" : "good" } as const],
    ["SKILLPROOF_WORKER_MODE", { label: process.env.SKILLPROOF_WORKER_MODE === "1" ? "worker" : "in-process", tone: "good" } as const],
  ];

  return (
    <RoleShell
      title="Settings"
      subtitle="Platform runtime configuration visible to admins."
      navLinks={ADMIN_NAV}
      activeHref="/admin/settings"
    >
      <Card>
        <CardHeader>
          <CardTitle>Admin Session</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
          <div><div className="text-xs uppercase text-muted">User</div><div className="mt-1 text-ink">{user.email}</div></div>
          <div><div className="text-xs uppercase text-muted">Role</div><Badge className="mt-1">{user.role}</Badge></div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {env.map(([name, state]) => (
              <div key={name as string} className="rounded-md border border-border p-3">
                <div className="font-mono text-xs text-muted">{name as string}</div>
                <Badge className="mt-2" tone={(state as any).tone}>{(state as any).label}</Badge>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </RoleShell>
  );
}
