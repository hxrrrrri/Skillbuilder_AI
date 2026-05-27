import { prisma } from "@/lib/db";

export const PROMPT_MAX_LENGTH = 10_000;

export type ActivePrompt = {
  id: string;
  agentName: string;
  version: number;
  system: string;
  instructions: string | null;
};

export type PromptVersionInput = {
  agentName: string;
  system: string;
  instructions?: string | null;
  activate?: boolean;
  createdById?: string | null;
};

function promptModel(client: any = prisma) {
  return client.promptVersion;
}

export function validatePromptContent(system: string, instructions?: string | null) {
  if (system.length > PROMPT_MAX_LENGTH) {
    throw new PromptValidationError("system_too_long");
  }
  if ((instructions ?? "").length > PROMPT_MAX_LENGTH) {
    throw new PromptValidationError("instructions_too_long");
  }
}

export class PromptValidationError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export async function getActivePrompt(agentName: string): Promise<ActivePrompt | null> {
  try {
    const row = await promptModel().findFirst({
      where: { agentName, isActive: true },
      orderBy: { version: "desc" },
      select: {
        id: true,
        agentName: true,
        version: true,
        system: true,
        instructions: true,
      },
    });
    if (!row?.system?.trim()) return null;
    return row;
  } catch (err) {
    console.error("[prompt-registry] failed to load active prompt", agentName, err);
    return null;
  }
}

export async function listPromptVersions(agentName?: string) {
  try {
    return await promptModel().findMany({
      where: agentName ? { agentName } : undefined,
      orderBy: [{ agentName: "asc" }, { version: "desc" }],
    });
  } catch (err) {
    console.error("[prompt-registry] failed to list prompt versions", err);
    return [];
  }
}

export async function createPromptVersion(input: PromptVersionInput) {
  validatePromptContent(input.system, input.instructions);
  return prisma.$transaction(async (tx) => {
    const model = promptModel(tx);
    const aggregate = await model.aggregate({
      where: { agentName: input.agentName },
      _max: { version: true },
    });
    const nextVersion = (aggregate._max.version ?? 0) + 1;
    if (input.activate) {
      await model.updateMany({
        where: { agentName: input.agentName, isActive: true },
        data: { isActive: false },
      });
    }
    return model.create({
      data: {
        agentName: input.agentName,
        version: nextVersion,
        system: input.system,
        instructions: input.instructions ?? null,
        isActive: !!input.activate,
        createdById: input.createdById ?? null,
      },
    });
  });
}

export async function activatePromptVersion(id: string) {
  return prisma.$transaction(async (tx) => {
    const model = promptModel(tx);
    const existing = await model.findUnique({ where: { id } });
    if (!existing) throw new PromptValidationError("not_found");
    await model.updateMany({
      where: { agentName: existing.agentName, isActive: true },
      data: { isActive: false },
    });
    return model.update({
      where: { id },
      data: { isActive: true },
    });
  });
}
