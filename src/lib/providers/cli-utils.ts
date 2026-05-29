import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runCommand, summarize } from "@/lib/local-runner/terminal";
import type { CommandRun } from "@/lib/local-runner/types";
import type { ProviderTemplate } from "./config";
import { ProviderExecutionError, ProviderInvalidJsonError } from "./errors";
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
  return { args, useStdin: true };
}

export async function probe(
  command: string,
  args: string[],
  timeoutMs = 5000,
  env?: Record<string, string | undefined>,
): Promise<CommandRun> {
  return runCommand({ command, args, timeoutMs, approved: true, maxOutputBytes: 32 * 1024, env });
}

export function combinedOutput(run: CommandRun): string {
  return [run.stdout, run.stderr].filter(Boolean).join("\n");
}

export function hasFlag(help: string, ...flags: string[]): boolean {
  return flags.some((flag) => help.includes(flag));
}

function parseModelList(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const fromJson = modelNamesFromJson(trimmed);
  if (fromJson.length) return fromJson;

  const ignored = /^(usage|options|commands|available models?|models?:|\[|\]|\{|\}|error|not found|unknown command)/i;
  const found: string[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const clean = line
      .replace(/^[\s*•\-]+/, "")
      .replace(/\s+\(.*?\)\s*$/, "")
      .trim();
    if (!clean || ignored.test(clean)) continue;
    const token = clean.match(/[A-Za-z0-9][A-Za-z0-9._:/-]{1,}/)?.[0];
    if (!token || ignored.test(token)) continue;
    found.push(token);
  }
  return Array.from(new Set(found));
}

function modelNamesFromJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    const values: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.models)
        ? parsed.models
        : Array.isArray(parsed?.data)
          ? parsed.data
          : [];
    return Array.from(
      new Set(
        values
          .map((item) =>
            typeof item === "string"
              ? item
              : typeof item === "object" && item
                ? String((item as any).id ?? (item as any).name ?? (item as any).model ?? "")
                : "",
          )
          .filter(Boolean),
      ),
    );
  } catch {
    return [];
  }
}

export async function discoverCliModels(
  command: string,
  fallbackModels: string[],
  env?: Record<string, string | undefined>,
): Promise<string[]> {
  const attempts = [
    ["models"],
    ["model", "list"],
  ];
  for (const args of attempts) {
    const run = await probe(command, args, 2000, env);
    if (run.exitCode !== 0) continue;
    const models = parseModelList(combinedOutput(run));
    if (models.length) return models;
  }
  return fallbackModels;
}

function authError(run: CommandRun): boolean {
  return /not authenticated|not logged in|login required|sign in|unauthorized|authentication|api key|openai_api_key|anthropic_api_key|missing credentials|no credentials/i.test(
    `${run.stdout}\n${run.stderr}`,
  );
}

function providerFailureCode(provider: ProviderId, run: CommandRun): "provider_not_authenticated" | "provider_timeout" | "provider_execution_failed" {
  if (authError(run)) return "provider_not_authenticated";
  if (run.status === "timeout") return "provider_timeout";
  return "provider_execution_failed";
}

function providerFailureMessage(label: string, run: CommandRun): string {
  if (run.status === "timeout") return `${label} timed out after ${run.durationMs}ms`;
  return `${label} failed with exit code ${run.exitCode}`;
}

function authFix(provider: ProviderId): string {
  if (provider === "codex_cli") return "Run codex and sign in with ChatGPT, then rerun Admin -> Providers -> Test.";
  if (provider === "claude_cli") return "Run claude auth login or set ANTHROPIC_API_KEY for Claude Code, then rerun provider health.";
  if (provider === "copilot_cli") return "Run copilot login or set COPILOT_GITHUB_TOKEN/GH_TOKEN with Copilot Requests access.";
  return "Authenticate the provider and rerun the provider health test.";
}

function providerModel(provider: ProviderId, prompt: ProviderPrompt, template?: ProviderTemplate): string {
  return prompt.model ? `${provider}:${prompt.model}` : `${provider}:${template?.model ?? template?.command ?? provider}`;
}

function appendModelArgs(args: string[], model: string | undefined, flag: string | undefined): string[] {
  if (!model || !flag) return args;
  if (args.includes(flag)) return args;
  return [flag, model, ...args];
}

function displayCommand(command: string, args: string[]): string {
  return [command, ...args.map((arg) => (arg.length > 160 ? "<prompt>" : arg))].join(" ");
}

function writePromptFile(provider: ProviderId, prompt: string): { promptArg: string; cleanup: () => void } {
  const dir = path.join(process.cwd(), ".skillproof", "provider-prompts");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${provider}-${randomUUID()}.txt`);
  fs.writeFileSync(file, prompt, "utf8");
  const relative = path.relative(process.cwd(), file).replace(/\\/g, "/");
  return {
    promptArg: relative,
    cleanup: () => {
      try {
        fs.unlinkSync(file);
      } catch {}
    },
  };
}

function readOutputFile(pathname?: string): string {
  if (!pathname) return "";
  try {
    return fs.readFileSync(pathname, "utf8").trim();
  } catch {
    return "";
  }
}

async function executeTemplate(
  command: string,
  templateArgs: string[],
  prompt: string,
  timeoutMs = 120_000,
  shell?: boolean,
  env?: Record<string, string | undefined>,
): Promise<CommandRun> {
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
      ...env,
    },
    shell,
  });
}

function toResult(
  provider: ProviderId,
  run: CommandRun,
  json: any | null,
  prompt: string,
  model: string,
  rawOverride?: string,
): ProviderResult {
  const raw = rawOverride ?? (run.stdout || run.stderr);
  return {
    json,
    raw,
    stdout: rawOverride ?? run.stdout,
    stderr: run.stderr,
    exitCode: run.exitCode,
    command: displayCommand(run.command, run.args),
    latencyMs: run.durationMs,
    provider,
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: Math.ceil(raw.length / 4),
    model,
  };
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
  modelFlag?: string;
  shell?: boolean;
  promptFile?: boolean;
  outputFilePath?: string;
  allowNonzeroExitWithJson?: boolean;
  env?: Record<string, string | undefined>;
}): Promise<ProviderResult> {
  const command = args.template?.command ?? args.defaultCommand;
  if (!command) {
    throw new ProviderExecutionError({
      provider: args.provider,
      code: "provider_missing_binary",
      message: `${args.label} has no configured command.`,
      fix: `Configure ${args.label} in Admin -> Providers.`,
    });
  }

  const configuredArgs = args.template?.args?.length ? args.template.args : args.defaultArgs;
  const combined = promptText(args.prompt, args.schemaHint);
  const effectiveModel = args.prompt.model ?? args.template?.model ?? undefined;
  const runtimeArgs = appendModelArgs(configuredArgs, effectiveModel, args.modelFlag);
  const model = providerModel(args.provider, args.prompt, args.template);
  const firstPrompt = args.promptFile ? writePromptFile(args.provider, combined) : null;
  const first = await executeTemplate(command, runtimeArgs, firstPrompt?.promptArg ?? combined, args.timeoutMs, args.shell, args.env);
  firstPrompt?.cleanup();
  const outputOverride = readOutputFile(args.outputFilePath);
  const firstStdout = outputOverride || first.stdout;
  const firstFallback = outputOverride ? `${first.stdout}\n${first.stderr}` : first.stderr || first.stdout;
  const firstJson = parseProviderJson(firstStdout, firstFallback);
  if ((first.exitCode === 0 || first.exitCode === null || (args.allowNonzeroExitWithJson && firstJson !== null)) && firstJson !== null) {
    return toResult(args.provider, first, firstJson, combined, model, outputOverride || undefined);
  }

  if (first.status === "timeout" || (first.exitCode !== null && first.exitCode !== 0)) {
    const code = providerFailureCode(args.provider, first);
    throw new ProviderExecutionError({
      provider: args.provider,
      code,
      message: providerFailureMessage(args.label, first),
      command: displayCommand(command, runtimeArgs),
      exitCode: first.exitCode,
      stderr: summarize(first.stderr, 1200),
      stdout: summarize(outputOverride || first.stdout, 1200),
      fix:
        code === "provider_not_authenticated"
          ? authFix(args.provider)
          : code === "provider_timeout"
            ? `Increase the provider timeout or verify ${args.label} can complete non-interactively from a terminal.`
            : `Run ${command} --help and update the provider command template in Admin -> Providers.`,
    });
  }

  if (args.repair !== false) {
    const repairedPrompt = jsonRepairPrompt(combined, args.schemaHint, first.stdout || first.stderr);
    const repairPromptFile = args.promptFile ? writePromptFile(args.provider, repairedPrompt) : null;
    const repairRun = await executeTemplate(
      command,
      runtimeArgs,
      repairPromptFile?.promptArg ?? repairedPrompt,
      args.timeoutMs,
      args.shell,
      args.env,
    );
    repairPromptFile?.cleanup();
    const repairOverride = readOutputFile(args.outputFilePath);
    const repairStdout = repairOverride || repairRun.stdout;
    const repairFallback = repairOverride ? `${repairRun.stdout}\n${repairRun.stderr}` : repairRun.stderr || repairRun.stdout;
    const repairedJson = parseProviderJson(repairStdout, repairFallback);
    if ((repairRun.exitCode === 0 || repairRun.exitCode === null || (args.allowNonzeroExitWithJson && repairedJson !== null)) && repairedJson !== null) {
      return toResult(args.provider, repairRun, repairedJson, repairedPrompt, model, repairOverride || undefined);
    }
    if (repairRun.status === "timeout" || (repairRun.exitCode !== null && repairRun.exitCode !== 0)) {
      const code = providerFailureCode(args.provider, repairRun);
      throw new ProviderExecutionError({
        provider: args.provider,
        code,
        message:
          code === "provider_timeout"
            ? `${args.label} repair attempt timed out after ${repairRun.durationMs}ms`
            : `${args.label} repair attempt failed with exit code ${repairRun.exitCode}`,
        command: displayCommand(command, runtimeArgs),
        exitCode: repairRun.exitCode,
        stderr: summarize(repairRun.stderr, 1200),
        stdout: summarize(repairOverride || repairRun.stdout, 1200),
        fix:
          code === "provider_not_authenticated"
            ? authFix(args.provider)
            : code === "provider_timeout"
              ? `Increase the provider timeout or verify ${args.label} can complete non-interactively from a terminal.`
              : `Run the Admin provider health test and verify ${args.label} can run non-interactively.`,
      });
    }
  }

  throw new ProviderInvalidJsonError({
    provider: args.provider,
    message: `${args.label} returned invalid JSON after retry`,
    result: first,
    fix: `Run the Admin provider health test and confirm ${args.label} can return JSON-only output.`,
  });
}
