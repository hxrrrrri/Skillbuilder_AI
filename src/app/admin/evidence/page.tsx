import { requireAdminPage } from "@/lib/auth/guards";
import { RoleShell } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ADMIN_NAV } from "../_nav";
import { EvidenceSearch } from "@/components/evidence-search";

export const dynamic = "force-dynamic";

export default async function AdminEvidencePage() {
  await requireAdminPage("/admin/evidence");

  return (
    <RoleShell
      title="Evidence search"
      subtitle="Search Evidence[] arrays across every SkillScore row. Filter by skill, source, run id, or free text."
      navLinks={ADMIN_NAV}
      activeHref="/admin/evidence"
    >
      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
        </CardHeader>
        <CardBody>
          <EvidenceSearch />
        </CardBody>
      </Card>
    </RoleShell>
  );
}
