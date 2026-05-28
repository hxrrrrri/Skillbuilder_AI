import type { ProviderTemplate } from "./config";
import { combinedOutput, hasFlag, probe, runCliJson } from "./cli-utils";
import type { LLMProvider, ProviderHealth, ProviderPrompt, ProviderResult } from "./types";

const FIX = "Install with `npm install -g @openai/codex`, run `codex`, sign in with ChatGPT, then verify with `codex --version` and Admin -> Providers -> Test.";

export async function detectCodexCli(template?: ProviderTemplate): Promise<ProviderHealth> {
  const command = template?.command ?? "codex";
  if (template?.enabled === false) return disabled(command);
  const version = await probe(command, ["--version"]);
  if (version.exitCode !== 0) {
    return {
      providerId: "codex_cli",
      label: "Codex CLI",
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
      lastError: combinedOutput(version) || "codex binary not found",
      fix: FIX,
      command,
      exitCode: version.exitCode,
      rawOutputPreview: combinedOutput(version).slice(0, 1000),
    };
  }
  const help = await probe(command, ["--help"]);
  const execHelp = await probe(command, ["exec", "--help"]);
  const auth = await probe(command, ["login", "status"]);
  const helpText = `${combinedOutput(help)}\n${combinedOutput(execHelp)}`;
  const authenticated = auth.exitCode === 0 && /logged in|authenticated|chatgpt|api key/i.test(combinedOutput(auth));
  const execExists = execHelp.exitCode === 0 && /Run Codex non-interactively/i.test(combinedOutput(execHelp));
  const status = !authenticated ? "installed_not_authenticated" : execExists ? "ready" : "invalid_command";
  return {
    providerId: "codex_cli",
    label: "Codex CLI",
    status,
    enabled: true,
    installed: true,
    authenticated,
    version: combinedOutput(version).trim() || null,
    supportsJson: hasFlag(helpText, "--json", "--output-last-message"),
    supportsNonInteractive: execExists,
    supportsModelSelection: hasFlag(helpText, "--model", "-m, --model"),
    supportsReasoningBudget: false,
    availableModels: [],
    configuredModel: template?.model ?? null,
    lastError: status === "ready" ? null : status === "installed_not_authenticated" ? "codex_not_authenticated" : "codex exec is not available",
    fix: status === "installed_not_authenticated" ? "Run codex and sign in with ChatGPT." : FIX,
    command,
    exitCode: status === "ready" ? 0 : auth.exitCode,
    rawOutputPreview: [combinedOutput(version), combinedOutput(auth), combinedOutput(execHelp)].join("\n").slice(0, 2000),
  };
}

function disabled(command: string): ProviderHealth {
  return {
    providerId: "codex_cli",
    label: "Codex CLI",
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
    fix: "Enable Codex CLI in Admin -> Providers after installing and authenticating it.",
    command,
  };
}

export function makeCodexCliProvider(template?: ProviderTemplate): LLMProvider {
  return {
    id: "codex_cli",
    label: "Codex CLI",
    async available() {
      const h = await detectCodexCli(template);
      return h.status === "ready";
    },
    health() {
      return detectCodexCli(template);
    },
    async runJson(prompt: ProviderPrompt, schemaHint: string): Promise<ProviderResult> {
      return runCliJson({
        provider: "codex_cli",
        label: "Codex CLI",
        template,
        defaultCommand: "codex",
        defaultArgs: ["exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", "-"],
        prompt,
        schemaHint,
      });
    },
  };
}
