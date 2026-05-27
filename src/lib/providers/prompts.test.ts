import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    promptVersion: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

import {
  PROMPT_MAX_LENGTH,
  PromptValidationError,
  activatePromptVersion,
  createPromptVersion,
  validatePromptContent,
} from "./prompts";

describe("prompt registry service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects prompt content over 10000 chars", () => {
    expect(() => validatePromptContent("x".repeat(PROMPT_MAX_LENGTH + 1))).toThrow(PromptValidationError);
    expect(() => validatePromptContent("ok", "x".repeat(PROMPT_MAX_LENGTH + 1))).toThrow(PromptValidationError);
  });

  it("creates activated versions transactionally and increments version", async () => {
    const tx = {
      promptVersion: {
        aggregate: vi.fn(async () => ({ _max: { version: 2 } })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        create: vi.fn(async (args) => ({ id: "pv3", ...args.data })),
      },
    };
    mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

    const created = await createPromptVersion({
      agentName: "orchestrator",
      system: "new system",
      instructions: "new instructions",
      activate: true,
      createdById: "user-1",
    });

    expect(tx.promptVersion.updateMany).toHaveBeenCalledWith({
      where: { agentName: "orchestrator", isActive: true },
      data: { isActive: false },
    });
    expect(tx.promptVersion.create).toHaveBeenCalledWith({
      data: {
        agentName: "orchestrator",
        version: 3,
        system: "new system",
        instructions: "new instructions",
        isActive: true,
        createdById: "user-1",
      },
    });
    expect(created.version).toBe(3);
  });

  it("activates exactly one prompt version per agent in a transaction", async () => {
    const tx = {
      promptVersion: {
        findUnique: vi.fn(async () => ({
          id: "pv2",
          agentName: "validator",
          version: 2,
        })),
        updateMany: vi.fn(async () => ({ count: 2 })),
        update: vi.fn(async () => ({
          id: "pv2",
          agentName: "validator",
          version: 2,
          isActive: true,
        })),
      },
    };
    mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

    const activated = await activatePromptVersion("pv2");

    expect(tx.promptVersion.updateMany).toHaveBeenCalledWith({
      where: { agentName: "validator", isActive: true },
      data: { isActive: false },
    });
    expect(tx.promptVersion.update).toHaveBeenCalledWith({
      where: { id: "pv2" },
      data: { isActive: true },
    });
    expect(activated).toMatchObject({ id: "pv2", agentName: "validator", isActive: true });
  });
});
