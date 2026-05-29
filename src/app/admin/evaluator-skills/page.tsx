import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { listEvaluatorSkillsWithStats } from "@/lib/evaluator-runtime/skill-registry";
import { RoleShell } from "@/components/role-shell";
import { ADMIN_NAV } from "../_nav";
import { SkillCards } from "./skill-cards";

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
      <SkillCards skills={skills} />
    </RoleShell>
  );
}
