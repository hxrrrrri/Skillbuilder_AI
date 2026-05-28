import type { ProviderTemplate } from "./config";
import { combinedOutput, hasFlag, probe, runCliJson } from "./cli-utils";
import type { LLMProvider, ProviderHealth, ProviderPrompt, ProviderResult } from "./types";

const FIX = "Install Claude Code, run `claude auth login`, then verify with `claude --version` and Admin -> Providers -> Test.";

export async function detectClaudeCli(template?: ProviderTemplate): Promise<ProviderHealth> {
  const command = template?.command ?? "claude";
  if (template?.enabled === false) return disabled(command);
  const version = await probe(command, ["--version"]);
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
      availableModels: [],
      configuredModel: template?.model ?? null,
      lastError: combinedOutput(version) || "claude binary not found",
      fix: FIX,
      command,
      exitCode: version.exitCode,
      rawOutputPreview: combinedOutput(version).slice(0, 1000),
    };
  }
  const help = await probe(command, ["--help"]);
  const auth = await probe(command, ["auth", "status"]);
  const helpText = combinedOutput(help);
  const authText = combinedOutput(auth);
  const authenticated = auth.exitCode === 0 && /"loggedIn"\s*:\s*true|logged in|authenticated/i.test(authText);
  const supportsPrint = hasFlag(helpText, "--print", "-p, --print");
  const status = !authenticated ? "installed_not_authenticated" : supportsPrint ? "ready" : "invalid_command";
  return {
    providerId: "claude_cli",
    label: "Claude CLI",
    status,
    enabled: true,
    installed: true,
    authenticated,
    version: combinedOutput(version).trim() || null,
    supportsJson: hasFlag(helpText, "--json-schema", "--output-format"),
    supportsNonInteractive: supportsPrint,
    supportsModelSelection: hasFlag(helpText, "--model"),
    supportsReasoningBudget: hasFlag(helpText, "--effort"),
    availableModels: [],
    configuredModel: template?.model ?? null,
    lastError: status === "ready" ? null : status === "installed_not_authenticated" ? "claude_not_authenticated" : "claude print mode is unavailable",
    fix: status === "installed_not_authenticated" ? "Run claude auth login." : FIX,
    command,
    exitCode: status === "ready" ? 0 : auth.exitCode,
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
    availableModels: [],
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
        defaultArgs: ["--print", "--output-format", "text", "--no-session-persistence", "{{prompt}}"],
        prompt,
        schemaHint,
      });
    },
  };
}
