import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { listEvaluatorSkillsWithStats } from "@/lib/evaluator-runtime/skill-registry";
import { safeJsonParse } from "@/lib/utils";
import { RoleShell } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV } from "../_nav";

export const dynamic = "force-dynamic";

export default async function AdminEvaluatorSkillsPage() {
  try {
    await requireRole("admin", "super_admin");
  } catch {
    redirect("/login?callbackUrl=/admin/evaluator-skills");
  }
  const skills = await listEvaluatorSkillsWithStats();

  return (
    <RoleShell
      title="Evaluator skills"
      subtitle="DB-backed evaluator registry. SkillProof runs use these versioned, evidence-producing skills."
      navLinks={ADMIN_NAV}
      activeHref="/admin/evaluator-skills"
    >
      <Card>
        <CardHeader>
          <CardTitle>Registry</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 pr-3">Skill</th>
                  <th className="py-2 pr-3">Version</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Risk</th>
                  <th className="py-2 pr-3">Allowed tools</th>
                  <th className="py-2 pr-3">Required inputs</th>
                  <th className="py-2 pr-3">Output schema</th>
                  <th className="py-2 pr-3">Runs</th>
                  <th className="py-2 pr-3">Last failure</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {skills.map((skill) => {
                  const tools = safeJsonParse<Record<string, string>>(skill.toolPermissionsJson, {});
                  const inputs = safeJsonParse<string[]>(skill.requiredInputsJson, []);
                  const output = safeJsonParse<any>(skill.outputSchemaJson, {});
                  return (
                    <tr key={skill.id} className="align-top">
                      <td className="py-3 pr-3">
                        <div className="font-medium text-ink">{skill.name}</div>
                        <div className="font-mono text-xs text-muted">{skill.slug}</div>
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs">{skill.version}</td>
                      <td className="py-3 pr-3"><Badge>{skill.category}</Badge></td>
                      <td className="py-3 pr-3">
                        <Badge tone={skill.enabled ? "good" : "warn"}>{skill.enabled ? "enabled" : "disabled"}</Badge>
                      </td>
                      <td className="py-3 pr-3"><Badge tone={skill.riskLevel === "low" ? "good" : "warn"}>{skill.riskLevel}</Badge></td>
                      <td className="py-3 pr-3">
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {Object.entries(tools).map(([k, v]) => <Badge key={k}>{k}:{String(v)}</Badge>)}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-xs text-muted">{inputs.join(", ")}</td>
                      <td className="py-3 pr-3 text-xs text-muted">{(output.produces ?? []).join(", ")}</td>
                      <td className="py-3 pr-3">{skill.runCount}</td>
                      <td className="py-3 pr-3 text-xs text-muted">
                        {skill.lastFailure ? `${skill.lastFailure.createdAt.toISOString().slice(0, 10)} · ${skill.lastFailure.error ?? "failed"}` : "none"}
                      </td>
                      <td className="py-3 pr-3 text-xs text-muted">preview · test · edit</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </RoleShell>
  );
}
