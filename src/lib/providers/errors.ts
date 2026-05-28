import type { ProviderId, ProviderMatrixAgentEntry, ProviderResult } from "./types";

export type ProviderErrorCode =
  | "provider_unavailable"
  | "provider_invalid_json"
  | "provider_execution_failed"
  | "provider_not_authenticated"
  | "provider_missing_binary"
  | "provider_disabled"
  | "provider_unsupported";

export class ProviderExecutionError extends Error {
  code: ProviderErrorCode;
  provider: ProviderId;
  agentName?: string;
  command?: string | null;
  exitCode?: number | null;
  stderr?: string | null;
  stdout?: string | null;
  fix?: string | null;
  runtime?: ProviderMatrixAgentEntry;

  constructor(args: {
    provider: ProviderId;
    message: string;
    code?: ProviderErrorCode;
    agentName?: string;
    command?: string | null;
    exitCode?: number | null;
    stderr?: string | null;
    stdout?: string | null;
    fix?: string | null;
    runtime?: ProviderMatrixAgentEntry;
  }) {
    super(args.message);
    this.name = "ProviderExecutionError";
    this.code = args.code ?? "provider_execution_failed";
    this.provider = args.provider;
    this.agentName = args.agentName;
    this.command = args.command;
    this.exitCode = args.exitCode;
    this.stderr = args.stderr;
    this.stdout = args.stdout;
    this.fix = args.fix;
    this.runtime = args.runtime;
  }
}

export class ProviderInvalidJsonError extends ProviderExecutionError {
  raw: string;

  constructor(args: {
    provider: ProviderId;
    message?: string;
    agentName?: string;
    result?: ProviderResult;
    raw?: string;
    fix?: string | null;
    runtime?: ProviderMatrixAgentEntry;
  }) {
    const raw = args.raw ?? args.result?.raw ?? "";
    super({
      provider: args.provider,
      message: args.message ?? `${args.provider} returned invalid JSON after retry`,
      code: "provider_invalid_json",
      agentName: args.agentName,
      command: args.result?.command,
      exitCode: args.result?.exitCode,
      stderr: args.result?.stderr,
      stdout: args.result?.stdout,
      fix: args.fix ?? "Run the provider health test and confirm the provider can return JSON-only output.",
      runtime: args.runtime,
    });
    this.name = "ProviderInvalidJsonError";
    this.raw = raw;
  }
}

export function providerErrorMetadata(err: unknown) {
  if (err instanceof ProviderExecutionError) {
    return {
      code: err.code,
      provider: err.provider,
      agentName: err.agentName,
      command: err.command,
      exitCode: err.exitCode,
      stderr: err.stderr,
      stdout: err.stdout,
      fix: err.fix,
    };
  }
  return null;
}
