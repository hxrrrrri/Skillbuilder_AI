/**
 * Seeds the ProviderConfig + AgentConfig registry from defaults.
 * Idempotent — re-running only creates missing rows unless --force is passed.
 *
 * Usage:
 *   npm run db:seed-registry              (create only)
 *   npm run db:seed-registry -- --force   (also overwrite existing rows)
 */
import { seedRegistry, PROVIDER_DEFAULTS, AGENT_DEFAULTS } from "../src/lib/providers/registry";
import { seedEvaluatorSkillRegistry, DEFAULT_EVALUATOR_SKILLS } from "../src/lib/evaluator-runtime/skill-registry";
import { prisma } from "../src/lib/db";

async function main() {
  const force = process.argv.includes("--force");
  console.log(`Seeding registry${force ? " (force-overwrite)" : ""}…`);
  const result = await seedRegistry({ force });
  console.log(
    `Providers: +${result.providers.created} created, ${result.providers.updated} updated (of ${PROVIDER_DEFAULTS.length} defaults)`,
  );
  console.log(
    `Agents:    +${result.agents.created} created, ${result.agents.updated} updated (of ${AGENT_DEFAULTS.length} defaults)`,
  );
  const skills = await seedEvaluatorSkillRegistry({ force });
  console.log(
    `Skills:    +${skills.created} created, ${skills.updated} updated (of ${DEFAULT_EVALUATOR_SKILLS.length} evaluator defaults)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
