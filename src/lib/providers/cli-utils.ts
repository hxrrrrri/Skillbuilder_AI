import { runCommand, summarize } from "@/lib/local-runner/terminal";
import type { CommandRun } from "@/lib/local-runner/types";
import type { ProviderTemplate } from "./config";
import { ProviderExecutionError } from "./errors";
import { jsonRepairPrompt, parseProviderJson } from "./json";
import type { ProviderId, ProviderPrompt, ProviderResult } from "./types";

export type CliDetection = {
  command: string;
  installed: boolean;
  version: string | null;
  help: string;
  authenticated: boolean;
  authStatus: string | null;
  supportsJson: boolean;
  supportsNonInteractive: boolean;
  supportsModelSelection: boolean;
  supportsReasoningBudget: boolean;
  error: string | null;
  fix: string;
};

export function promptText(prompt: ProviderPrompt, schemaHint: string): string {
  return `${prompt.system}

Return JSON only. No markdown. No prose.
Required JSON shape: ${schemaHint}

TASK:
${prompt.user}`;
}

export function fillArgs(args: string[], prompt: string): { args: string[]; useStdin: boolean } {
  if (args.some((a) => a.includes("{{prompt}}"))) {
    return { args: args.map((a) => a.replace("{{prompt}}", prompt)), useStdin: false };
  }
  if (args.includes("-")) return { args, useStdin: true };
  return { args, useStdin: true };
}

export async function probe(command: string, args: string[], timeoutMs = 5000): Promise<CommandRun> {
  return runCommand({ command, args, timeoutMs, approved: true, maxOutputBytes: 32 * 1024 });
}

export function combinedOutput(run: CommandRun): string {
  return [run.stdout, run.stderr].filter(Boolean).join("\n");
}

export function hasFlag(help: string, ...flags: string[]): boolean {
  return flags.some((flag) => help.includes(flag));
}

export async function runCliJson(args: {
  provider: ProviderId;
  label: string;
  template: ProviderTemplate | undefined;
  defaultCommand: string;
  defaultArgs: string[];
  prompt: ProviderPrompt;
  schemaHint: string;
  timeoutMs?: number;
  repair?: boolean;
}): Promise<ProviderResult> {
  const command = args.template?.command ?? args.defaultCommand;
  const configuredArgs = args.template?.args?.length ? args.template.args : args.defaultArgs;
  const modelArgs = args.prompt.model ? appendModelArgs(args.provider, configuredArgs, args.prompt.model) : configuredArgs;
  const combined = promptText(args.prompt, args.schemaHint);
  const first = await executeTemplate(command, modelArgs, combined, args.timeoutMs);
  const firstJson = parseProviderJson(first.stdout, first.stdout || first.stderr);
  // exitCode null means killed by timeout — treat as success if JSON was already captured.
  // Some CLIs (e.g. copilot via stdin) respond then stay alive; we kill them after reading output.
  if ((first.exitCode === 0 || first.exitCode === null) && firstJson !== null) {
    return toResult(args.provider, first, firstJson, combined, args.prompt.model ?? args.template?.model ?? command);
  }
  if (first.exitCode !== null && first.exitCode !== 0) {
    throw new ProviderExecutionError({
      provider: args.provider,
      code: authError(first) ? "provider_not_authenticated" : "provider_execution_failed",
      message: `${args.label} failed with exit code ${first.exitCode}`,
      command: [command, ...modelArgs].join(" "),
      exitCode: first.exitCode,
      stderr: summarize(first.stderr, 1200),
      stdout: summarize(first.stdout, 1200),
      fix: authError(first) ? authFix(args.provider) : `Run ${command} --help and update the provider command template in Admin -> Providers.`,
    });
  }

  if (args.repair !== false) {
    const repairedPrompt = jsonRepairPrompt(combined, args.schemaHint, first.stdout || first.stderr);
    const repairRun = await executeTemplate(command, modelArgs, repairedPrompt, args.timeoutMs);
    const repairedJson = parseProviderJson(repairRun.stdout, repairRun.stdout || repairRun.stderr);
    if ((repairRun.exitCode === 0 || repairRun.exitCode === null) && repairedJson !== null) {
      return toResult(args.provider, repairRun, repairedJson, repairedPrompt, args.prompt.model ?? args.template?.model ?? command);
    }
    if (repairRun.exitCode !== null && repairRun.exitCode !== 0) {
      throw new ProviderExecutionError({
        provider: args.provider,
        code: authError(repairRun) ? "provider_not_authenticated" : "provider_execution_failed",
        message: `${args.label} repair attempt failed with exit code ${repairRun.exitCode}`,
        command: [command, ...modelArgs].join(" "),
        exitCode: repairRun.exitCode,
        stderr: summarize(repairRun.stderr, 1200),
        stdout: summarize(repairRun.stdout, 1200),
        fix: authError(repairRun) ? authFix(args.provider) : `Run the Admin provider health test and verify ${args.label} can run non-interactively.`,
      });
    }
    return toResult(args.provider, repairRun, null, repairedPrompt, args.prompt.model ?? args.template?.model ?? command);
  }

  return toResult(args.provider, first, null, combined, args.prompt.model ?? args.template?.model ?? command);
}

async function executeTemplate(command: string, templateArgs: string[], prompt: string, timeoutMs = 120_000): Promise<CommandRun> {
  const { args, useStdin } = fillArgs(templateArgs, prompt);
  return runCommand({
    command,
    args,
    timeoutMs,
    approved: true,
    input: useStdin ? prompt : undefined,
    maxOutputBytes: 512 * 1024,
    env: {
      NO_COLOR: "1",
      CI: "1",
      COPILOT_AUTO_UPDATE: "false",
    },
  });
}

function toResult(provider: ProviderId, run: CommandRun, json: any | null, prompt: string, model: string): ProviderResult {
  const raw = run.stdout || run.stderr;
  return {
    json,
    raw,
    stdout: run.stdout,
    stderr: run.stderr,
    exitCode: run.exitCode,
    command: [run.command, ...run.args].join(" "),
    latencyMs: run.durationMs,
    provider,
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: Math.ceil(raw.length / 4),
    model: `${provider}:${model}`,
  };
}

function appendModelArgs(provider: ProviderId, args: string[], model: string): string[] {
  if (args.includes("--model") || args.includes("-m")) return args;
  if (provider === "codex_cli") return ["--model", model, ...args];
  if (provider === "claude_cli") return ["--model", model, ...args];
  if (provider === "copilot_cli") return ["--model", model, ...args];
  return args;
}

function authError(run: CommandRun): boolean {
  return /not authenticated|not logged in|login required|sign in|unauthorized|authentication/i.test(
    `${run.stdout}\n${run.stderr}`,
  );
}

function authFix(provider: ProviderId): string {
  if (provider === "codex_cli") return "Run codex and sign in with ChatGPT, then rerun Admin -> Providers -> Test.";
  if (provider === "claude_cli") return "Run claude auth login or set ANTHROPIC_API_KEY for Claude Code, then rerun provider health.";
  if (provider === "copilot_cli") return "Run copilot login or set COPILOT_GITHUB_TOKEN/GH_TOKEN with Copilot Requests access.";
  return "Authenticate the provider and rerun the provider health test.";
}
