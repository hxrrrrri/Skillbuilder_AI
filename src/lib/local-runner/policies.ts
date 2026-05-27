// Command safety policy. Order: dangerous patterns first, then allowlist, then approval gates.

import type { PolicyDecision } from "./types";

const ALLOWED_COMMANDS = new Set([
  "git",
  "gh",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "node",
  "python",
  "python3",
  "py",
  "pytest",
  "tsc",
  "eslint",
  "claude",
  "codex",
  "ollama",
  "copilot",
  "gh-copilot",
]);

// Hard-blocked patterns. Never approved.
const DESTRUCTIVE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\brm\s+-rf\b/i, reason: "rm -rf is destructive" },
  { re: /\brm\s+-fr\b/i, reason: "rm -fr is destructive" },
  { re: /\brm\s+-r\s+.*\/\s*$/i, reason: "rm -r on root-like path" },
  { re: /\bdel\b\s+\/s/i, reason: "del /s is destructive" },
  { re: /\bRemove-Item\b.*-Recurse.*-Force/i, reason: "Remove-Item -Recurse -Force is destructive" },
  { re: /\bformat\b\s+[a-z]:/i, reason: "format <drive> is destructive" },
  { re: /\bshutdown\b/i, reason: "shutdown is dangerous" },
  { re: /\bmkfs\b/i, reason: "mkfs is destructive" },
  { re: /\bdd\b\s+if=/i, reason: "dd if= is risky" },
  { re: /:\(\)\s*\{\s*:\|:&\s*\};:/, reason: "fork bomb" },
  { re: /\biwr\b.*\|\s*iex/i, reason: "PowerShell iwr|iex" },
  { re: /Invoke-Expression/i, reason: "Invoke-Expression executes arbitrary code" },
  { re: /Set-ExecutionPolicy/i, reason: "modifies PowerShell execution policy" },
  { re: /\bcat\b\s+.*\.env\b/i, reason: "reading .env may expose secrets" },
  { re: /Get-Content\b\s+.*\.env\b/i, reason: "reading .env may expose secrets" },
  { re: /\benv\b\s*$/i, reason: "dumping env may expose secrets" },
  { re: /printenv\b/i, reason: "printenv may expose secrets" },
  { re: /Get-ChildItem\s+env:/i, reason: "dumping env may expose secrets" },
  { re: /\.ssh\b/i, reason: "ssh dir access" },
];

// Approval-required patterns. Allowed if `approved: true`.
const APPROVAL_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bnpm\b\s+install\s+-g\b/i, reason: "global npm install" },
  { re: /\bnpm\b\s+i\s+-g\b/i, reason: "global npm install" },
  { re: /\bpnpm\b\s+add\s+-g\b/i, reason: "global pnpm install" },
  { re: /\byarn\b\s+global\s+add\b/i, reason: "global yarn add" },
  { re: /\bcurl\b.*\|\s*(bash|sh|zsh|pwsh|powershell)/i, reason: "curl|sh download-execute" },
  { re: /\bwget\b.*\|\s*(bash|sh)/i, reason: "wget|sh download-execute" },
];

export type PolicyInput = {
  command: string;
  args?: string[];
  approved?: boolean;
};

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const command = (input.command || "").trim();
  const args = input.args ?? [];
  const fullLine = [command, ...args].join(" ");

  if (!command) {
    return { allowed: false, reason: "empty command", requiresApproval: false };
  }

  // 1. Dangerous patterns first — block regardless of approval.
  for (const p of DESTRUCTIVE_PATTERNS) {
    if (p.re.test(fullLine)) {
      return { allowed: false, reason: p.reason, requiresApproval: false };
    }
  }

  // 2. Allowlist check. Unknown commands rejected — no arbitrary shell execution.
  const base = command.split(/[\\/]/).pop()!.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();
  if (!ALLOWED_COMMANDS.has(base)) {
    return {
      allowed: false,
      reason: `command "${base}" not in allowlist`,
      requiresApproval: false,
    };
  }

  // 3. Approval-required patterns — gated by `approved` flag, but only for allowlisted base commands.
  for (const p of APPROVAL_PATTERNS) {
    if (p.re.test(fullLine)) {
      if (input.approved) {
        return { allowed: true, reason: `approved: ${p.reason}`, requiresApproval: false };
      }
      return { allowed: false, reason: p.reason, requiresApproval: true };
    }
  }

  return { allowed: true, reason: "ok", requiresApproval: false };
}

export const POLICY_ALLOWLIST = Array.from(ALLOWED_COMMANDS);
