import type { ProviderTemplate } from "./config";
import { combinedOutput, hasFlag, probe, runCliJson } from "./cli-utils";
import { modelsForProvider } from "./model-catalog";
import type { LLMProvider, ProviderHealth, ProviderPrompt, ProviderResult } from "./types";

const FIX =
  "Install Claude Code, run `claude auth login`, then verify `claude --version` and Admin -> Providers -> Test.";
const CLAUDE_CLI_ENV = { ANTHROPIC_API_KEY: undefined };

function authDetected(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.loggedIn === true) return true;
  } catch {}
  return /logged in|["']?loggedin["']?\s*:\s*true|authenticated|signed in/i.test(text);
}

function authMissing(text: string): boolean {
  return /not authenticated|not logged in|login required|sign in|unauthorized|missing api key|no credentials/i.test(text);
}

async function probeAuth(command: string): Promise<{ authenticated: boolean; output: string; exitCode: number | null }> {
  const attempts = [
    ["auth", "status"],
    ["auth", "whoami"],
    ["status"],
    ["whoami"],
  ] as const;
  const outputs: string[] = [];
  for (const args of attempts) {
    const run = await probe(command, [...args], 5000, CLAUDE_CLI_ENV);
    const output = combinedOutput(run);
    if (output) outputs.push(output);
    if (authMissing(output)) return { authenticated: false, output, exitCode: run.exitCode };
    if (authDetected(output)) return { authenticated: true, output, exitCode: run.exitCode };
  }
  // Some versions do not expose auth-status. Treat as authenticated; the JSON contract test will fail closed if needed.
  return { authenticated: true, output: outputs.join("\n"), exitCode: 0 };
}

export async function detectClaudeCli(template?: ProviderTemplate): Promise<ProviderHealth> {
  const command = template?.command ?? "claude";
  if (template?.enabled === false) return disabled(command);

  const version = await probe(command, ["--version"], 5000, CLAUDE_CLI_ENV);
  if (version.exitCode !== 0) {
    return {
      providerId: "claude_cli",
      label: "Claude CLI",
      status: "missing_binary",
      enabled: true,
      installed: false,
      authenticated: false,
      version: null,
      supportsJson: false,
      supportsNonInteractive: false,
      supportsModelSelection: false,
      supportsReasoningBudget: false,
      availableModels: modelsForProvider("claude_cli"),
      configuredModel: template?.model ?? null,
      lastError: combinedOutput(version) || "claude binary not found",
      fix: FIX,
      command,
      exitCode: version.exitCode,
      rawOutputPreview: combinedOutput(version).slice(0, 1000),
    };
  }

  const help = await probe(command, ["--help"], 5000, CLAUDE_CLI_ENV);
  const auth = await probeAuth(command);
  const helpText = combinedOutput(help);
  const authText = auth.output;
  const authenticated = auth.authenticated;
  const supportsPrint = hasFlag(helpText, "--print", "-p, --print");
  const supportsJson = hasFlag(helpText, "--json", "--output-format", "--output-format text");
  const status = !authenticated ? "installed_not_authenticated" : supportsPrint ? "ready" : "invalid_command";

  return {
    providerId: "claude_cli",
    label: "Claude CLI",
    status,
    enabled: true,
    installed: true,
    authenticated,
    version: combinedOutput(version).trim() || null,
    supportsJson,
    supportsNonInteractive: supportsPrint,
    supportsModelSelection: hasFlag(helpText, "--model"),
    supportsReasoningBudget: hasFlag(helpText, "--effort"),
    availableModels: modelsForProvider("claude_cli"),
    configuredModel: template?.model ?? null,
    lastError:
      status === "ready"
        ? null
        : status === "installed_not_authenticated"
          ? "claude_not_authenticated"
          : "claude print mode is unavailable",
    fix: status === "installed_not_authenticated" ? "Run claude auth login or set ANTHROPIC_API_KEY for Claude Code." : FIX,
    command,
    exitCode: status === "ready" ? 0 : status === "installed_not_authenticated" ? auth.exitCode : help.exitCode,
    rawOutputPreview: [combinedOutput(version), authText, helpText].join("\n").slice(0, 2000),
  };
}

function disabled(command: string): ProviderHealth {
  return {
    providerId: "claude_cli",
    label: "Claude CLI",
    status: "disabled",
    enabled: false,
    installed: false,
    authenticated: false,
    version: null,
    supportsJson: false,
    supportsNonInteractive: false,
    supportsModelSelection: false,
    supportsReasoningBudget: false,
    availableModels: modelsForProvider("claude_cli"),
    configuredModel: null,
    fix: "Enable Claude CLI in Admin -> Providers after installing and authenticating it.",
    command,
  };
}

export function makeClaudeCliProvider(template?: ProviderTemplate): LLMProvider {
  return {
    id: "claude_cli",
    label: "Claude CLI",
    async available() {
      const h = await detectClaudeCli(template);
      return h.status === "ready";
    },
    health() {
      return detectClaudeCli(template);
    },
    async runJson(prompt: ProviderPrompt, schemaHint: string): Promise<ProviderResult> {
      return runCliJson({
        provider: "claude_cli",
        label: "Claude CLI",
        template,
        defaultCommand: "claude",
        defaultArgs: ["--print", "--output-format", "text", "--no-session-persistence"],
        modelFlag: "--model",
        env: CLAUDE_CLI_ENV,
        prompt,
        schemaHint,
      });
    },
  };
}
