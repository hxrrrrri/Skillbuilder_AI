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

// Approved npx packages — anything else hits approval gate.
const NPX_ALLOWED_PACKAGES = new Set([
  "tsc",
  "eslint",
  "prettier",
  "vitest",
  "jest",
  "playwright",
  "next",
  "prisma",
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
  { re: /\btype\b\s+.*\.env\b/i, reason: "reading .env may expose secrets" },
  { re: /\bmore\b\s+.*\.env\b/i, reason: "reading .env may expose secrets" },
  { re: /Get-Content\b\s+.*\.env\b/i, reason: "reading .env may expose secrets" },
  { re: /\benv\b\s*$/i, reason: "dumping env may expose secrets" },
  { re: /printenv\b/i, reason: "printenv may expose secrets" },
  { re: /Get-ChildItem\s+env:/i, reason: "dumping env may expose secrets" },
  { re: /\bprocess\.env\b/i, reason: "node code reading process.env may expose secrets" },
  { re: /\bos\.environ\b/i, reason: "python code reading os.environ may expose secrets" },
  { re: /\.ssh\b/i, reason: "ssh dir access" },
  { re: /\b(id_rsa|id_dsa|id_ecdsa|id_ed25519|known_hosts|authorized_keys)\b/i, reason: "private key or SSH credential access" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i, reason: "private key material access" },
  { re: /\bcurl\b.*\|\s*(bash|sh|zsh|pwsh|powershell)\b/i, reason: "curl|sh download-execute" },
  { re: /\bwget\b.*\|\s*(bash|sh|zsh|pwsh|powershell)\b/i, reason: "wget|sh download-execute" },
];

// Approval-required patterns. Allowed if `approved: true`.
const APPROVAL_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bnpm\b\s+(install|i)\b/i, reason: "npm install may execute dependency lifecycle scripts" },
  { re: /\bpnpm\b\s+install\b/i, reason: "pnpm install may execute dependency lifecycle scripts" },
  { re: /\byarn\b\s+install\b/i, reason: "yarn install may execute dependency lifecycle scripts" },
  { re: /\bbun\b\s+install\b/i, reason: "bun install may execute dependency lifecycle scripts" },
  { re: /\bnpm\b\s+(run|test)\b/i, reason: "npm package scripts execute project-defined commands" },
  { re: /\bpnpm\b\s+(run|test)\b/i, reason: "pnpm package scripts execute project-defined commands" },
  { re: /\byarn\b\s+(run|test|build|lint)\b/i, reason: "yarn package scripts execute project-defined commands" },
  { re: /\bbun\b\s+(run|test)\b/i, reason: "bun package scripts execute project-defined commands" },
  { re: /\bnpm\b\s+install\s+-g\b/i, reason: "global npm install" },
  { re: /\bnpm\b\s+i\s+-g\b/i, reason: "global npm install" },
  { re: /\bpnpm\b\s+add\s+-g\b/i, reason: "global pnpm install" },
  { re: /\byarn\b\s+global\s+add\b/i, reason: "global yarn add" },
];

export type PolicyInput = {
  command: string;
  args?: string[];
  approved?: boolean;
};

function baseName(command: string): string {
  return command
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(exe|cmd|bat|ps1)$/i, "")
    .toLowerCase();
}

// Interpreter escape hatches: node -e, python -c, etc. are hard-blocked.
function checkInterpreterEscape(base: string, args: string[]): { hit: boolean; reason: string } {
  const isNode = base === "node";
  const isPython = base === "python" || base === "python3" || base === "py";
  if (!isNode && !isPython) return { hit: false, reason: "" };

  for (const a of args) {
    if (isNode && (a === "-e" || a === "--eval" || a === "-p" || a === "--print")) {
      return { hit: true, reason: "node -e/-p evaluates arbitrary code" };
    }
    if (isPython && a === "-c") {
      return { hit: true, reason: "python -c evaluates arbitrary code" };
    }
  }
  return { hit: false, reason: "" };
}

// npx <pkg> — only known-safe packages allowed without approval.
function checkNpxPackage(base: string, args: string[]): { hit: boolean; reason: string } {
  if (base !== "npx") return { hit: false, reason: "" };
  // skip flags to find the first positional package
  const pkg = args.find((a) => !a.startsWith("-"));
  if (!pkg) return { hit: true, reason: "npx requires explicit package" };
  const root = pkg.replace(/^@[^/]+\//, "").split("@")[0];
  if (!NPX_ALLOWED_PACKAGES.has(root) && !NPX_ALLOWED_PACKAGES.has(pkg)) {
    return { hit: true, reason: `npx ${pkg} not on allowed package list` };
  }
  return { hit: false, reason: "" };
}

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
  const base = baseName(command);
  if (!ALLOWED_COMMANDS.has(base)) {
    return {
      allowed: false,
      reason: `command "${base}" not in allowlist`,
      requiresApproval: false,
    };
  }

  // 3. Interpreter escape hatches are blocked. These can read env, files, or network
  // even when the visible command looks harmless.
  const esc = checkInterpreterEscape(base, args);
  if (esc.hit) {
    return { allowed: false, reason: esc.reason, requiresApproval: false };
  }

  // 4. npx package allowlist.
  const nx = checkNpxPackage(base, args);
  if (nx.hit) {
    if (input.approved) {
      return { allowed: true, reason: `approved: ${nx.reason}`, requiresApproval: false };
    }
    return { allowed: false, reason: nx.reason, requiresApproval: true };
  }

  // 5. Approval-required patterns — gated by `approved` flag.
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
