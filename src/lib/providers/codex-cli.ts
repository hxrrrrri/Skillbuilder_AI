import type { ProviderTemplate } from "./config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { combinedOutput, discoverCliModels, hasFlag, probe, runCliJson } from "./cli-utils";
import { ProviderExecutionError, ProviderInvalidJsonError } from "./errors";
import { modelsForProvider } from "./model-catalog";
import type { LLMProvider, ProviderHealth, ProviderPrompt, ProviderResult } from "./types";

const FIX =
  "Install with `npm install -g @openai/codex`, run `codex`, sign in with ChatGPT or configure supported API-key auth, then verify `codex --version` and Admin -> Providers -> Test.";

function authDetected(text: string): boolean {
  return /logged in|signed in|authenticated|api key|chatgpt/i.test(text);
}

function authMissing(text: string): boolean {
  return /not authenticated|login required|sign in required|unauthorized|missing api key|openai_api_key|no credentials/i.test(text);
}

function createOutputFile() {
  const dir = path.join(process.cwd(), ".skillproof", "provider-outputs");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `codex-${randomUUID()}.json`);
  return {
    path: file,
    cleanup: () => {
      try {
        fs.unlinkSync(file);
      } catch {}
    },
  };
}

function createSchemaFile(schemaHint: string) {
  const dir = path.join(process.cwd(), ".skillproof", "provider-schemas");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `codex-schema-${randomUUID()}.json`);
  const schema = {
    description: "Codex JSON output schema",
    hint: schemaHint,
    anyOf: [{ type: "object" }, { type: "array" }],
  };
  fs.writeFileSync(file, JSON.stringify(schema, null, 2), "utf8");
  return {
    path: file,
    cleanup: () => {
      try {
        fs.unlinkSync(file);
      } catch {}
    },
  };
}

function insertOutputArg(args: string[], outputPath: string): string[] {
  const out = [...args];
  if (out.includes("--output-last-message")) return out;
  const promptFlagIndex = out.findIndex((a) => a === "--prompt" || a === "-p");
  const promptIndex = out.findIndex((a) => a === "{{prompt}}" || a === "-");
  const insertAt = promptFlagIndex !== -1 ? promptFlagIndex : promptIndex !== -1 ? promptIndex : out.length;
  return [...out.slice(0, insertAt), "--output-last-message", outputPath, ...out.slice(insertAt)];
}

function insertSchemaArg(args: string[], schemaPath: string): string[] {
  const out = [...args];
  if (out.includes("--output-schema")) return out;
  const promptFlagIndex = out.findIndex((a) => a === "--prompt" || a === "-p");
  const promptIndex = out.findIndex((a) => a === "{{prompt}}" || a === "-");
  const insertAt = promptFlagIndex !== -1 ? promptFlagIndex : promptIndex !== -1 ? promptIndex : out.length;
  return [...out.slice(0, insertAt), "--output-schema", schemaPath, ...out.slice(insertAt)];
}

async function probeAuth(command: string): Promise<{ authenticated: boolean; output: string; exitCode: number | null }> {
  const attempts = [
    ["login", "status"],
    ["auth", "status"],
    ["status"],
    ["auth", "whoami"],
  ] as const;

  const outputs: string[] = [];

  for (const args of attempts) {
    const run = await probe(command, [...args], 5000);
    const output = combinedOutput(run);
    if (output) outputs.push(output);
    if (authMissing(output)) return { authenticated: false, output, exitCode: run.exitCode };
    if (authDetected(output)) return { authenticated: true, output, exitCode: run.exitCode };
  }

  // Some versions do not expose auth status. Treat as authenticated; JSON contract will fail closed if needed.
  return { authenticated: true, output: outputs.join("\n"), exitCode: 0 };
}

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
      availableModels: modelsForProvider("codex_cli"),
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
  const auth = await probeAuth(command);
  const helpText = `${combinedOutput(help)}\n${combinedOutput(execHelp)}`;
  const authText = auth.output;
  const authenticated = auth.authenticated;
  const supportsExec = execHelp.exitCode === 0 && /exec/i.test(combinedOutput(execHelp));
  const supportsJson = hasFlag(helpText, "--json", "--output", "--output-last-message");
  const supportsModel = hasFlag(helpText, "--model", "-m, --model");
  const status = !authenticated ? "installed_not_authenticated" : supportsExec ? "ready" : "invalid_command";
  const availableModels = await discoverCliModels(command, modelsForProvider("codex_cli"));

  return {
    providerId: "codex_cli",
    label: "Codex CLI",
    status,
    enabled: true,
    installed: true,
    authenticated,
    version: combinedOutput(version).trim() || null,
    supportsJson,
    supportsNonInteractive: supportsExec,
    supportsModelSelection: supportsModel,
    supportsReasoningBudget: false,
    availableModels,
    configuredModel: template?.model ?? null,
    lastError:
      status === "ready"
        ? null
        : status === "installed_not_authenticated"
          ? "codex_not_authenticated"
          : "codex_exec_unavailable",
    fix:
      status === "installed_not_authenticated"
        ? "Run codex and sign in with ChatGPT or supported API-key auth."
        : FIX,
    command,
    exitCode: status === "ready" ? 0 : status === "installed_not_authenticated" ? auth.exitCode : execHelp.exitCode,
    rawOutputPreview: [combinedOutput(version), authText, helpText].join("\n").slice(0, 2000),
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
    availableModels: modelsForProvider("codex_cli"),
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
      const base = {
        provider: "codex_cli" as const,
        label: "Codex CLI",
        template,
        defaultCommand: "codex",
        modelFlag: "--model",
        prompt,
        schemaHint,
      };

      if (template?.args?.length) {
        const output = createOutputFile();
        const schema = createSchemaFile(schemaHint);
        try {
          const withSchema = insertSchemaArg(template.args, schema.path);
          const withOutput = insertOutputArg(withSchema, output.path);
          return await runCliJson({
            ...base,
            defaultArgs: withOutput,
            outputFilePath: output.path,
            allowNonzeroExitWithJson: true,
          });
        } finally {
          output.cleanup();
          schema.cleanup();
        }
      }

      const attempts: string[][] = [
        ["exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", "-"],
        ["exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only"],
        ["exec", "--ephemeral", "--sandbox", "read-only", "-"],
        ["exec", "--ephemeral", "--sandbox", "read-only"],
        ["exec", "--ephemeral", "-"],
        ["exec", "--ephemeral"],
        ["exec", "-"],
        ["exec"],
        ["exec", "{{prompt}}"],
        ["exec", "--prompt", "{{prompt}}"],
        ["exec", "-p", "{{prompt}}"],
      ];

      let lastError: unknown = null;
      for (const defaultArgs of attempts) {
        const output = createOutputFile();
        const schema = createSchemaFile(schemaHint);
        try {
          const withSchema = insertSchemaArg(defaultArgs, schema.path);
          const withOutput = insertOutputArg(withSchema, output.path);
          const result = await runCliJson({
            ...base,
            defaultArgs: withOutput,
            outputFilePath: output.path,
            allowNonzeroExitWithJson: true,
          });
          return result;
        } catch (err) {
          if (err instanceof ProviderInvalidJsonError) throw err;
          if (err instanceof ProviderExecutionError) {
            if (err.code === "provider_not_authenticated" || err.code === "provider_timeout") throw err;
            lastError = err;
            continue;
          }
          throw err;
        } finally {
          output.cleanup();
          schema.cleanup();
        }
      }

      if (lastError) throw lastError;
      throw new ProviderExecutionError({
        provider: "codex_cli",
        message: "Codex CLI failed for all command variants.",
      });
    },
  };
}
