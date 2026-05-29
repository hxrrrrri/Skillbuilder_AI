import { requireAdminPage } from "@/lib/auth/guards";
import { AGENT_NAMES, listPromptVersions } from "@/lib/providers/registry";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ADMIN_NAV } from "../_nav";
import { PromptAdmin } from "./prompt-admin";

export const dynamic = "force-dynamic";

export default async function AdminPromptsPage() {
  await requireAdminPage("/admin/prompts");

  const versions = await listPromptVersions();
  const rows = versions.map((v: any) => ({
    id: v.id,
    agentName: v.agentName,
    version: v.version,
    system: v.system,
    instructions: v.instructions,
    isActive: v.isActive,
    createdById: v.createdById,
    createdAt: v.createdAt.toISOString(),
  }));

  return (
    <RoleShell
      title="Prompts"
      subtitle="Versioned system prompts for agent runtime. Active versions override inline defaults on the next run."
      navLinks={ADMIN_NAV}
      activeHref="/admin/prompts"
    >
      {rows.length === 0 ? (
        <Card showTrafficLights>
          <CardBody>
            <ScaffoldNotice detail="No prompt versions exist yet. Run `npm run db:seed-prompts` after applying the PromptVersion schema." />
          </CardBody>
        </Card>
      ) : (
        <Card showTrafficLights className="card-section-plain border-bg bg-transparent shadow-none backdrop-blur-0">
          <CardHeader className="border-bg pl-20">
            <CardTitle>Agent prompt versions</CardTitle>
          </CardHeader>
          <CardBody>
            <PromptAdmin agentNames={[...AGENT_NAMES]} versions={rows} />
          </CardBody>
        </Card>
      )}
    </RoleShell>
  );
}
