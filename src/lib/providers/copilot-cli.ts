import type { ProviderTemplate } from "./config";
import { combinedOutput, hasFlag, probe, runCliJson } from "./cli-utils";
import type { LLMProvider, ProviderHealth, ProviderPrompt, ProviderResult } from "./types";

const FIX = "Install/configure the modern GitHub Copilot CLI, run `copilot login`, then verify `copilot --version` and Admin -> Providers -> Test.";
const LEGACY = "Legacy gh copilot extension detected — retired, not supported as a production provider. Install/configure the new GitHub Copilot CLI.";

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
      availableModels: [],
      configuredModel: template?.model ?? null,
      lastError: legacyDetected ? LEGACY : combinedOutput(version) || "modern copilot binary not found",
      fix: legacyDetected ? LEGACY : FIX,
      command,
      exitCode: version.exitCode,
      rawOutputPreview: [combinedOutput(version), combinedOutput(legacy)].join("\n").slice(0, 2000),
    };
  }
  const help = await probe(command, ["--help"], 10_000);
  const helpText = combinedOutput(help);
  const supportsPrompt = hasFlag(helpText, "--prompt", "-p, --prompt");
  const supportsJson = hasFlag(helpText, "--output-format");
  const status = supportsPrompt ? "ready" : "unsupported_for_scoring";
  return {
    providerId: "copilot_cli",
    label: "GitHub Copilot CLI",
    status,
    enabled: true,
    installed: true,
    authenticated: true,
    version: combinedOutput(version).trim() || null,
    supportsJson,
    supportsNonInteractive: supportsPrompt,
    supportsModelSelection: hasFlag(helpText, "--model"),
    supportsReasoningBudget: hasFlag(helpText, "--effort", "--reasoning-effort"),
    availableModels: [],
    configuredModel: template?.model ?? null,
    lastError: status === "ready" ? null : "modern Copilot CLI lacks non-interactive prompt support",
    fix: status === "ready" ? "Run a JSON contract test before enabling for scoring." : FIX,
    command,
    exitCode: status === "ready" ? 0 : help.exitCode,
    rawOutputPreview: [combinedOutput(version), helpText, legacyDetected ? LEGACY : ""].join("\n").slice(0, 3000),
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
    availableModels: [],
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
        // Pass prompt via stdin (no -p flag). On Windows, Volta creates .cmd shims so shell:true is used,
        // and -p with multi-line prompts containing " breaks cmd.exe quoting. Copilot detects non-TTY
        // stdin and processes it; we kill the process after the response is received.
        defaultArgs: ["--silent", "--no-auto-update", "--allow-all-tools", "--no-ask-user", "--stream", "off"],
        timeoutMs: 25_000,
        repair: false,
        prompt,
        schemaHint,
      });
    },
  };
}
