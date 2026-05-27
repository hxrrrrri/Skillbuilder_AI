import type { Handoff } from "@/agents/types";
import { redactText } from "./redaction";

export function buildAdminTrace(input: {
  handoff?: Handoff | null;
  error?: unknown;
  inputHash: string;
  outputHash?: string | null;
}) {
  const runtime = input.handoff?.runtime;
  return {
    agent: input.handoff?.agent ?? null,
    runtime,
    inputHash: input.inputHash,
    outputHash: input.outputHash ?? null,
    completed: input.handoff?.completed ?? [],
    unresolved: input.handoff?.unresolved ?? [],
    issuesFound: input.handoff?.issues_found ?? [],
    evidenceCount: input.handoff?.evidence?.length ?? 0,
    parsedOutput: input.handoff ? redactText(input.handoff.output, 8000) : null,
    error: input.error ? redactText(input.error instanceof Error ? input.error.message : String(input.error), 2000) : null,
  };
}
