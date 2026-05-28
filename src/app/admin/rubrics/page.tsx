import { requireAdminPage } from "@/lib/auth/guards";
import { RoleShell } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV } from "../_nav";
import { RUBRIC_WEIGHTS } from "@/agents/skill-graph";

export const dynamic = "force-dynamic";

export default async function AdminRubricsPage() {
  await requireAdminPage("/admin/rubrics");
  const total = Object.values(RUBRIC_WEIGHTS).reduce((sum, n) => sum + n, 0);

  return (
    <RoleShell
      title="Rubrics"
      subtitle="Evidence-first scoring weights. Not-measured dimensions are excluded from the denominator."
      navLinks={ADMIN_NAV}
      activeHref="/admin/rubrics"
    >
      <Card>
        <CardHeader>
          <CardTitle>SkillProof Score Rubric</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="mb-3 flex items-center gap-2">
            <Badge tone={total === 100 ? "good" : "warn"}>total weight {total}</Badge>
            <Badge>source required</Badge>
            <Badge>evidence required</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr><th className="py-2">Skill</th><th>Weight</th><th>Scoring rule</th></tr>
              </thead>
              <tbody>
                {Object.entries(RUBRIC_WEIGHTS).map(([skill, weight]) => (
                  <tr key={skill} className="border-t border-border">
                    <td className="py-2 text-ink">{skill}</td>
                    <td>{weight}</td>
                    <td className="text-muted">Requires evidence, source, and confidence. Missing proof is Not measured.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </RoleShell>
  );
}
