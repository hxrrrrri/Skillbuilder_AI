import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { AGENT_NAMES } from "../src/lib/providers/registry";

const PROMPT_SOURCES: Record<string, string> = {
  orchestrator: "src/agents/orchestrator.ts",
  architecture: "src/agents/architecture.ts",
  "code-quality": "src/agents/code-quality.ts",
  testing: "src/agents/testing.ts",
  security: "src/agents/security.ts",
  "git-evidence": "src/agents/git-evidence.ts",
  documentation: "src/agents/documentation.ts",
  authenticity: "src/agents/authenticity.ts",
  "interview-gen": "src/agents/interview-gen.ts",
  "answer-evaluator": "src/agents/answer-evaluator.ts",
  "ai-collaboration-evaluator": "src/app/api/challenge/evaluate/route.ts",
  validator: "src/agents/validator.ts",
  "profile-gen": "src/agents/profile-gen.ts",
};

function extractSystemPrompt(relativePath: string): string {
  const file = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(file, "utf8");
  const match = source.match(/const SYSTEM = `([\s\S]*?)`;/);
  if (!match) throw new Error(`No const SYSTEM template found in ${relativePath}`);
  return match[1];
}

async function main() {
  const force = process.argv.includes("--force");
  const model = (prisma as any).promptVersion;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const agentName of AGENT_NAMES) {
    const system = PROMPT_SOURCES[agentName] ? extractSystemPrompt(PROMPT_SOURCES[agentName]) : "";
    const existing = await model.findFirst({
      where: { agentName, version: 1 },
    });
    if (!existing) {
      await model.create({
        data: {
          agentName,
          version: 1,
          system,
          instructions: null,
          isActive: true,
        },
      });
      created++;
    } else if (force) {
      await model.update({
        where: { id: existing.id },
        data: {
          system,
          instructions: null,
          isActive: true,
        },
      });
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`Prompt seed complete. created=${created} updated=${updated} skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
