import { prisma } from "@/lib/db";
import { loadSkillFile } from "./skill-loader";
import { validateSkillManifest } from "./validators";

export const DEFAULT_EVALUATOR_SKILLS = [
  "repo-architecture-review",
  "code-quality-review",
  "testing-depth-review",
  "security-review",
  "debugging-ability-review",
  "ai-collaboration-review",
  "git-commit-quality-review",
  "system-design-review",
  "frontend-review",
  "backend-review",
  "database-review",
  "devops-readiness-review",
] as const;

export type DefaultEvaluatorSkillSlug = (typeof DEFAULT_EVALUATOR_SKILLS)[number];

export function skillPath(slug: string): string {
  return `evaluator-skills/${slug}/SKILL.md`;
}

export function loadDefaultEvaluatorSkill(slug: string) {
  return loadSkillFile(skillPath(slug));
}

export async function ensureEvaluatorSkill(slug: string) {
  const existing = await prisma.evaluatorSkill.findUnique({ where: { slug } });
  if (existing) return existing;
  const manifest = loadDefaultEvaluatorSkill(slug);
  const errors = validateSkillManifest(manifest);
  if (errors.length) throw new Error(`Invalid evaluator skill ${slug}: ${errors.join(", ")}`);
  return prisma.evaluatorSkill.create({
    data: {
      slug: manifest.id,
      name: manifest.name,
      category: manifest.category,
      version: manifest.version,
      description: manifest.description ?? firstParagraph(manifest.body),
      sourcePath: manifest.sourcePath,
      enabled: true,
      riskLevel: manifest.riskLevel,
      requiredInputsJson: JSON.stringify(manifest.requiredInputs),
      outputSchemaJson: JSON.stringify({ produces: manifest.produces }),
      toolPermissionsJson: JSON.stringify(manifest.toolPermissions),
      candidateSafe: true,
      employerSafe: true,
      adminOnly: manifest.visibility === "internal",
    },
  });
}

export async function seedEvaluatorSkillRegistry(options: { force?: boolean } = {}) {
  let created = 0;
  let updated = 0;
  for (const slug of DEFAULT_EVALUATOR_SKILLS) {
    const manifest = loadDefaultEvaluatorSkill(slug);
    const errors = validateSkillManifest(manifest);
    if (errors.length) throw new Error(`Invalid evaluator skill ${slug}: ${errors.join(", ")}`);
    const data = {
      name: manifest.name,
      category: manifest.category,
      version: manifest.version,
      description: manifest.description ?? firstParagraph(manifest.body),
      sourcePath: manifest.sourcePath,
      riskLevel: manifest.riskLevel,
      requiredInputsJson: JSON.stringify(manifest.requiredInputs),
      outputSchemaJson: JSON.stringify({ produces: manifest.produces }),
      toolPermissionsJson: JSON.stringify(manifest.toolPermissions),
      candidateSafe: true,
      employerSafe: true,
      adminOnly: manifest.visibility === "internal",
    };
    const existing = await prisma.evaluatorSkill.findUnique({ where: { slug: manifest.id } });
    if (!existing) {
      await prisma.evaluatorSkill.create({ data: { slug: manifest.id, enabled: true, ...data } });
      created++;
    } else if (options.force) {
      await prisma.evaluatorSkill.update({ where: { slug: manifest.id }, data });
      updated++;
    }
  }
  return { created, updated, total: DEFAULT_EVALUATOR_SKILLS.length };
}

export async function listEvaluatorSkillsWithStats() {
  const rows = await prisma.evaluatorSkill.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  const stats = await prisma.skillRun.groupBy({
    by: ["skillId", "status"],
    _count: { _all: true },
  });
  const lastFailures = await prisma.skillRun.findMany({
    where: { status: "failed" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((skill) => {
    const runCount = stats
      .filter((s) => s.skillId === skill.slug)
      .reduce((sum, s) => sum + s._count._all, 0);
    const lastFailure = lastFailures.find((f) => f.skillId === skill.slug);
    return { ...skill, runCount, lastFailure };
  });
}

function firstParagraph(body: string): string {
  return body
    .split(/\r?\n\r?\n/)
    .map((p) => p.replace(/^#+\s+/gm, "").trim())
    .find(Boolean)
    ?.slice(0, 240) ?? "";
}
