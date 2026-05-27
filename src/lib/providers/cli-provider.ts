// Generic CLI provider — runs a configured command template, parses JSON.

import { extractJson } from "@/lib/claude";
import { runCommand } from "@/lib/local-runner/terminal";
import type { ProviderTemplate } from "./config";
import type { LLMProvider, ProviderId, ProviderPrompt, ProviderResult } from "./types";

function fillArgs(args: string[], prompt: string): { args: string[]; useStdin: boolean } {
  if (args.some((a) => a.includes("{{prompt}}"))) {
    return { args: args.map((a) => a.replace("{{prompt}}", prompt)), useStdin: false };
  }
  return { args, useStdin: true };
}

export function makeCliProvider(opts: {
  id: ProviderId;
  label: string;
  template: ProviderTemplate | undefined;
  probeArgs?: string[];
}): LLMProvider {
  return {
    id: opts.id,
    label: opts.label,
    async available() {
      if (!opts.template?.command || opts.template.enabled === false) return false;
      const probe = await runCommand({
        command: opts.template.command,
        args: opts.probeArgs ?? ["--version"],
        timeoutMs: 4000,
        approved: true,
      });
      return probe.exitCode === 0;
    },
    async runJson(prompt: ProviderPrompt, schemaHint: string): Promise<ProviderResult> {
      const tpl = opts.template;
      if (!tpl?.command) {
        return { json: null, raw: "", provider: opts.id, inputTokens: 0, outputTokens: 0, model: opts.id };
      }
      const combined = `${prompt.system}\n\nReturn JSON only matching: ${schemaHint}\n\nTASK:\n${prompt.user}`;
      const { args, useStdin } = fillArgs(tpl.args ?? [], combined);
      const result = await runCommand({
        command: tpl.command,
        args,
        timeoutMs: 90_000,
        approved: true,
        input: useStdin ? combined : undefined,
      });
      const raw = result.stdout || result.stderr;
      return {
        json: extractJson(raw),
        raw,
        provider: opts.id,
        inputTokens: Math.ceil(combined.length / 4),
        outputTokens: Math.ceil(raw.length / 4),
        model: `${opts.id}:${tpl.command}`,
      };
    },
  };
}
