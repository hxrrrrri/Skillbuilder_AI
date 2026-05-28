import type { ProviderTemplate } from "./config";
import { combinedOutput, hasFlag, probe, runCliJson } from "./cli-utils";
import { modelsForProvider } from "./model-catalog";
import type { LLMProvider, ProviderHealth, ProviderPrompt, ProviderResult } from "./types";

const FIX = "Install/configure the modern GitHub Copilot CLI, run `copilot login`, then verify `copilot --version` and Admin -> Providers -> Test.";
const LEGACY = "Legacy gh copilot extension detected — retired, not supported as a production provider. Install/configure the new GitHub Copilot CLI.";

function authDetected(text: string): boolean {
  return /logged in|signed in|authenticated|authorized|active subscription|github/i.test(text);
}

function authMissing(text: string): boolean {
  return /not authenticated|not logged in|sign in|login required|unauthorized|forbidden|no active subscription/i.test(text);
}

async function probeAuth(command: string): Promise<{ authenticated: boolean; output: string; exitCode: number | null }> {
  const attempts = [
    ["auth", "status"],
    ["login", "status"],
    ["status"],
  ] as const;
  const outputs: string[] = [];
  for (const args of attempts) {
    const run = await probe(command, [...args], 5000);
    const output = combinedOutput(run);
    if (output) outputs.push(output);
    if (run.exitCode === 0 && authDetected(output)) return { authenticated: true, output, exitCode: run.exitCode };
    if (authMissing(output)) return { authenticated: false, output, exitCode: run.exitCode };
  }
  // Some installed versions do not expose an auth-status command. Treat auth as
  // unknown-but-not-blocking; the JSON contract test will still fail closed.
  return { authenticated: true, output: outputs.join("\n"), exitCode: 0 };
}

export async function detectCopilotCli(template?: ProviderTemplate): Promise<ProviderHealth> {
  const command = template?.command ?? "copilot";
  if (template?.enabled === false) return disabled(command);
  const legacy = await probe("gh", ["copilot", "--help"]);
  const legacyDetected = legacy.exitCode === 0;
  const version = await probe(command, ["--version"], 10_000);
  if (version.exitCode !== 0) {
    return {
      providerId: "copilot_cli",
      label: "GitHub Copilot CLI",
      status: legacyDetected ? "unsupported_for_scoring" : "missing_binary",
      enabled: true,
      installed: false,
      authenticated: false,
      version: null,
      supportsJson: false,
      supportsNonInteractive: false,
      supportsModelSelection: false,
      supportsReasoningBudget: false,
      availableModels: modelsForProvider("copilot_cli"),
      configuredModel: template?.model ?? null,
      lastError: legacyDetected ? LEGACY : combinedOutput(version) || "modern copilot binary not found",
      fix: legacyDetected ? LEGACY : FIX,
      command,
      exitCode: version.exitCode,
      rawOutputPreview: [combinedOutput(version), combinedOutput(legacy)].join("\n").slice(0, 2000),
    };
  }
  const help = await probe(command, ["--help"], 10_000);
  const auth = await probeAuth(command);
  const helpText = combinedOutput(help);
  const supportsPrompt = hasFlag(helpText, "--prompt", "-p, --prompt") || /stdin|non-interactive|pipe/i.test(helpText);
  const supportsJson = hasFlag(helpText, "--output-format");
  const status = !auth.authenticated
    ? "installed_not_authenticated"
    : supportsPrompt
      ? "ready"
      : "unsupported_for_scoring";
  return {
    providerId: "copilot_cli",
    label: "GitHub Copilot CLI",
    status,
    enabled: true,
    installed: true,
    authenticated: auth.authenticated,
    version: combinedOutput(version).trim() || null,
    supportsJson,
    supportsNonInteractive: supportsPrompt,
    supportsModelSelection: hasFlag(helpText, "--model"),
    supportsReasoningBudget: hasFlag(helpText, "--effort", "--reasoning-effort"),
    availableModels: modelsForProvider("copilot_cli"),
    configuredModel: template?.model ?? null,
    lastError:
      status === "ready"
        ? null
        : status === "installed_not_authenticated"
          ? "copilot_not_authenticated"
          : "modern Copilot CLI lacks non-interactive prompt support",
    fix:
      status === "ready"
        ? "Run a JSON contract test before enabling for scoring."
        : status === "installed_not_authenticated"
          ? "Run copilot login, then rerun the provider health test."
          : FIX,
    command,
    exitCode: status === "ready" ? 0 : status === "installed_not_authenticated" ? auth.exitCode : help.exitCode,
    rawOutputPreview: [combinedOutput(version), auth.output, helpText, legacyDetected ? LEGACY : ""].join("\n").slice(0, 3000),
  };
}

function disabled(command: string): ProviderHealth {
  return {
    providerId: "copilot_cli",
    label: "GitHub Copilot CLI",
    status: "disabled",
    enabled: false,
    installed: false,
    authenticated: false,
    version: null,
    supportsJson: false,
    supportsNonInteractive: false,
    supportsModelSelection: false,
    supportsReasoningBudget: false,
    availableModels: modelsForProvider("copilot_cli"),
    configuredModel: null,
    fix: "Enable Copilot CLI only after the modern `copilot` binary passes the JSON contract test.",
    command,
  };
}

export function makeCopilotCliProvider(template?: ProviderTemplate): LLMProvider {
  return {
    id: "copilot_cli",
    label: "GitHub Copilot CLI",
    async available() {
      const h = await detectCopilotCli(template);
      return h.status === "ready";
    },
    health() {
      return detectCopilotCli(template);
    },
    async runJson(prompt: ProviderPrompt, schemaHint: string): Promise<ProviderResult> {
      return runCliJson({
        provider: "copilot_cli",
        label: "GitHub Copilot CLI",
        template,
        defaultCommand: "copilot",
        defaultArgs: ["-p", "{{prompt}}", "--silent", "--no-auto-update", "--no-ask-user", "--stream", "off"],
        modelFlag: "--model",
        timeoutMs: 25_000,
        repair: false,
        promptFile: true,
        prompt,
        schemaHint,
      });
    },
  };
}
