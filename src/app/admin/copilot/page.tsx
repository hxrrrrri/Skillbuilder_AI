import { requireAdminPage } from "@/lib/auth/guards";
import { RoleShell } from "@/components/role-shell";
import { ADMIN_NAV } from "../_nav";
import { CopilotConsole } from "./copilot-console";

export const dynamic = "force-dynamic";

export default async function AdminCopilotPage() {
  const user = await requireAdminPage("/admin/copilot");

  return (
    <RoleShell
      title="Command Copilot"
      subtitle="Operate SkillProof AI through a typed, RBAC-enforced tool registry. Read tools run immediately; write, sensitive, and destructive actions require your explicit approval with a before/after diff. Forbidden actions never execute."
      navLinks={ADMIN_NAV}
      activeHref="/admin/copilot"
    >
      <CopilotConsole role={user.role} />
    </RoleShell>
  );
}
