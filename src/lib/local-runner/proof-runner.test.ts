import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { issueOwnershipChallengeToken } from "@/lib/ownership-challenge";
import { runProof } from "./proof-runner";

const mocks = vi.hoisted(() => ({
  runCommand: vi.fn(async (opts: any) => ({
    id: `cmd-${Math.random()}`,
    command: opts.command,
    args: opts.args ?? [],
    cwd: opts.cwd ?? "",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 5,
    status: "completed",
  })),
  prisma: {
    terminalCommandRun: { upsert: vi.fn() },
  },
}));

vi.mock("./terminal", () => ({
  runCommand: mocks.runCommand,
  summarize: (value: string, max: number) => value.slice(0, max),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

describe("runProof", () => {
  let tempRoot = "";

  afterEach(() => {
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("detects server-issued ownership tokens inside README", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skillproof-proof-"));
    const runId = "run-ownership";
    const workspace = path.join(tempRoot, runId);
    fs.mkdirSync(workspace, { recursive: true });
    mocks.prisma.terminalCommandRun.upsert.mockResolvedValue(undefined);

    const issued = issueOwnershipChallengeToken({
      challengeId: "challenge-1",
      userId: "user-1",
      owner: "octo",
      repo: "demo",
    });

    fs.writeFileSync(path.join(workspace, "README.md"), `SkillProof ownership challenge: ${issued.token}\n`, "utf8");

    const result = await runProof({
      runId,
      repoUrl: "https://github.com/octo/demo",
      repoOwner: "octo",
      ownershipTokenHash: issued.tokenHash,
      policy: { workspaceRoot: tempRoot },
    });

    expect(result.ownership.repo_token_verified).toBe(true);
  });
});
