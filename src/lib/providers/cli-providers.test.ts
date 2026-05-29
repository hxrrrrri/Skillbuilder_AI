import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandRun } from "@/lib/local-runner/types";
import { ProviderInvalidJsonError } from "./errors";

const mocks = vi.hoisted(() => ({
  runCommand: vi.fn(),
}));

vi.mock("@/lib/local-runner/terminal", () => ({
  runCommand: mocks.runCommand,
  summarize: (text: string, max = 1200) => (text.length > max ? text.slice(0, max) : text),
}));

type RunPatch = Partial<Pick<CommandRun, "stdout" | "stderr" | "exitCode" | "status" | "durationMs">>;

function commandKey(command: string, args: string[] = []) {
  return [command, ...args].join(" ");
}

function commandRun(command: string, args: string[], patch: RunPatch = {}): CommandRun {
  return {
    id: "cmd-1",
    command,
    args,
    cwd: process.cwd(),
    startedAt: new Date(0).toISOString(),
    completedAt: new Date(1).toISOString(),
    exitCode: patch.exitCode ?? 0,
    stdout: patch.stdout ?? "",
    stderr: patch.stderr ?? "",
    durationMs: patch.durationMs ?? 10,
    status: patch.status ?? "completed",
  };
}

function installScenario(map: Record<string, RunPatch>) {
  mocks.runCommand.mockImplementation(async (opts: { command?: string; args?: string[] } = {}) => {
    const command = opts.command ?? "";
    const args = opts.args ?? [];
    const key = commandKey(command, args);
    const normalizedArgs =
      command === "codex"
        ? args.filter((a, i) => {
            if (a === "--output-last-message" || a === "--output-schema") return false;
            const prev = args[i - 1];
            if (prev === "--output-last-message" || prev === "--output-schema") return false;
            if (typeof a === "string" && /\.skillproof\//i.test(a)) return false;
            return true;
          })
        : args;
    const normalizedKey =
      command === "copilot" && args[0] === "-p" && args[1]?.startsWith(".skillproof/provider-prompts/")
        ? "copilot -p <prompt-file> --silent --no-auto-update --no-ask-user --stream off"
        : commandKey(command, normalizedArgs);
    const patch = map[normalizedKey] ?? { exitCode: 1, stderr: "command failed" };
    return commandRun(command, args, patch);
  });
}

describe("Codex CLI provider", () => {
  beforeEach(() => mocks.runCommand.mockReset());

  it("reports missing binary", async () => {
    installScenario({ "codex --version": { exitCode: 1, stderr: "not found" } });
    const { detectCodexCli } = await import("./codex-cli");
    await expect(detectCodexCli()).resolves.toMatchObject({
      status: "missing_binary",
      installed: false,
      authenticated: false,
    });
  });

  it("reports installed but not authenticated", async () => {
    installScenario({
      "codex --version": { stdout: "codex 1.0.0" },
      "codex --help": { stdout: "codex --model exec" },
      "codex exec --help": { stdout: "Usage: codex exec --model" },
      "codex login status": { exitCode: 1, stderr: "not authenticated" },
    });
    const { detectCodexCli } = await import("./codex-cli");
    await expect(detectCodexCli()).resolves.toMatchObject({
      status: "installed_not_authenticated",
      installed: true,
      authenticated: false,
      lastError: "codex_not_authenticated",
    });
  });

  it("uses live model output when the CLI exposes models", async () => {
    installScenario({
      "codex --version": { stdout: "codex 1.0.0" },
      "codex --help": { stdout: "codex --model exec" },
      "codex exec --help": { stdout: "Usage: codex exec --model" },
      "codex login status": { stdout: "logged in with ChatGPT" },
      "codex models": { stdout: "gpt-5.5\ngpt-5.5-codex\n" },
    });
    const { detectCodexCli } = await import("./codex-cli");
    await expect(detectCodexCli()).resolves.toMatchObject({
      status: "ready",
      availableModels: ["gpt-5.5", "gpt-5.5-codex"],
    });
  });

  it("reports missing exec support", async () => {
    installScenario({
      "codex --version": { stdout: "codex 1.0.0" },
      "codex --help": { stdout: "codex --model" },
      "codex exec --help": { exitCode: 1, stderr: "unknown command exec" },
      "codex login status": { stdout: "logged in with ChatGPT" },
    });
    const { detectCodexCli } = await import("./codex-cli");
    await expect(detectCodexCli()).resolves.toMatchObject({
      status: "invalid_command",
      lastError: "codex_exec_unavailable",
    });
  });

  it("fails closed on invalid JSON", async () => {
    installScenario({
      "codex exec --ephemeral --skip-git-repo-check --sandbox read-only -": { stdout: "not json" },
    });
    const { makeCodexCliProvider } = await import("./codex-cli");
    const provider = makeCodexCliProvider();
    await expect(provider.runJson({ system: "s", user: "u" }, '{"ok":boolean}')).rejects.toBeInstanceOf(
      ProviderInvalidJsonError,
    );
  });

  it("returns parsed JSON on success", async () => {
    installScenario({
      "codex exec --ephemeral --skip-git-repo-check --sandbox read-only -": { stdout: '{"ok":true}' },
    });
    const { makeCodexCliProvider } = await import("./codex-cli");
    const provider = makeCodexCliProvider();
    await expect(provider.runJson({ system: "s", user: "u" }, '{"ok":boolean}')).resolves.toMatchObject({
      json: { ok: true },
      provider: "codex_cli",
    });
  });
});

describe("Claude CLI provider", () => {
  beforeEach(() => mocks.runCommand.mockReset());

  it("reports missing binary", async () => {
    installScenario({ "claude --version": { exitCode: 1, stderr: "not found" } });
    const { detectClaudeCli } = await import("./claude-cli");
    await expect(detectClaudeCli()).resolves.toMatchObject({ status: "missing_binary" });
  });

  it("reports installed but not authenticated", async () => {
    installScenario({
      "claude --version": { stdout: "claude 1.0.0" },
      "claude --help": { stdout: "Usage: claude --print --output-format --model" },
      "claude auth status": { exitCode: 1, stderr: "not logged in" },
    });
    const { detectClaudeCli } = await import("./claude-cli");
    await expect(detectClaudeCli()).resolves.toMatchObject({
      status: "installed_not_authenticated",
      lastError: "claude_not_authenticated",
    });
  });

  it("reports missing print mode", async () => {
    installScenario({
      "claude --version": { stdout: "claude 1.0.0" },
      "claude --help": { stdout: "Usage: claude --model" },
      "claude auth status": { stdout: "authenticated" },
    });
    const { detectClaudeCli } = await import("./claude-cli");
    await expect(detectClaudeCli()).resolves.toMatchObject({
      status: "invalid_command",
      supportsNonInteractive: false,
    });
  });

  it("uses live model output when Claude CLI exposes models", async () => {
    installScenario({
      "claude --version": { stdout: "claude 1.0.0" },
      "claude --help": { stdout: "Usage: claude --print --output-format --model" },
      "claude auth status": { stdout: "authenticated" },
      "claude models": { stdout: "opus\nsonnet\nhaiku\n" },
    });
    const { detectClaudeCli } = await import("./claude-cli");
    await expect(detectClaudeCli()).resolves.toMatchObject({
      status: "ready",
      availableModels: ["opus", "sonnet", "haiku"],
    });
  });

  it("fails closed on invalid JSON", async () => {
    installScenario({
      "claude --print --output-format text --no-session-persistence": { stdout: "plain text" },
    });
    const { makeClaudeCliProvider } = await import("./claude-cli");
    await expect(makeClaudeCliProvider().runJson({ system: "s", user: "u" }, '{"ok":boolean}')).rejects.toBeInstanceOf(
      ProviderInvalidJsonError,
    );
  });

  it("returns parsed JSON on success", async () => {
    installScenario({
      "claude --print --output-format text --no-session-persistence": { stdout: '{"ok":true}' },
    });
    const { makeClaudeCliProvider } = await import("./claude-cli");
    await expect(makeClaudeCliProvider().runJson({ system: "s", user: "u" }, '{"ok":boolean}')).resolves.toMatchObject({
      json: { ok: true },
      provider: "claude_cli",
    });
  });
});

describe("GitHub Copilot CLI provider", () => {
  beforeEach(() => mocks.runCommand.mockReset());

  it("rejects the legacy gh copilot extension as unsupported for scoring", async () => {
    installScenario({
      "gh copilot --help": { stdout: "gh copilot suggest" },
      "copilot --version": { exitCode: 1, stderr: "not found" },
    });
    const { detectCopilotCli } = await import("./copilot-cli");
    await expect(detectCopilotCli()).resolves.toMatchObject({
      status: "unsupported_for_scoring",
      installed: false,
    });
  });

  it("reports missing modern binary", async () => {
    installScenario({
      "gh copilot --help": { exitCode: 1, stderr: "unknown extension" },
      "copilot --version": { exitCode: 1, stderr: "not found" },
    });
    const { detectCopilotCli } = await import("./copilot-cli");
    await expect(detectCopilotCli()).resolves.toMatchObject({ status: "missing_binary" });
  });

  it("reports installed but not authenticated", async () => {
    installScenario({
      "gh copilot --help": { exitCode: 1, stderr: "unknown extension" },
      "copilot --version": { stdout: "copilot 1.0.0" },
      "copilot --help": { stdout: "Usage: copilot --prompt --model" },
      "copilot auth status": { exitCode: 1, stderr: "not authenticated" },
    });
    const { detectCopilotCli } = await import("./copilot-cli");
    await expect(detectCopilotCli()).resolves.toMatchObject({
      status: "installed_not_authenticated",
      authenticated: false,
    });
  });

  it("reports unsupported non-interactive mode", async () => {
    installScenario({
      "gh copilot --help": { exitCode: 1, stderr: "unknown extension" },
      "copilot --version": { stdout: "copilot 1.0.0" },
      "copilot --help": { stdout: "Usage: copilot interactive" },
      "copilot auth status": { stdout: "logged in" },
    });
    const { detectCopilotCli } = await import("./copilot-cli");
    await expect(detectCopilotCli()).resolves.toMatchObject({
      status: "unsupported_for_scoring",
      supportsNonInteractive: false,
    });
  });

  it("uses live model output when Copilot CLI exposes models", async () => {
    installScenario({
      "gh copilot --help": { exitCode: 1, stderr: "unknown extension" },
      "copilot --version": { stdout: "copilot 1.0.0" },
      "copilot --help": { stdout: "Usage: copilot --prompt --model" },
      "copilot auth status": { stdout: "logged in" },
      "copilot models": { stdout: "claude-haiku-4.5\ngpt-5.5-codex\n" },
    });
    const { detectCopilotCli } = await import("./copilot-cli");
    await expect(detectCopilotCli()).resolves.toMatchObject({
      status: "ready",
      availableModels: ["claude-haiku-4.5", "gpt-5.5-codex"],
    });
  });

  it("fails closed on invalid JSON", async () => {
    installScenario({
      "copilot -p <prompt-file> --silent --no-auto-update --no-ask-user --stream off": { stdout: "not json" },
    });
    const { makeCopilotCliProvider } = await import("./copilot-cli");
    await expect(makeCopilotCliProvider().runJson({ system: "s", user: "u" }, '{"ok":boolean}')).rejects.toBeInstanceOf(
      ProviderInvalidJsonError,
    );
  });

  it("returns parsed JSON on success", async () => {
    installScenario({
      "copilot -p <prompt-file> --silent --no-auto-update --no-ask-user --stream off": { stdout: '{"ok":true}' },
    });
    const { makeCopilotCliProvider } = await import("./copilot-cli");
    await expect(makeCopilotCliProvider().runJson({ system: "s", user: "u" }, '{"ok":boolean}')).resolves.toMatchObject({
      json: { ok: true },
      provider: "copilot_cli",
    });
  });
});
