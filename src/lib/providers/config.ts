// Loads skillproof.local.json provider config. Safe defaults if file missing.

import fs from "node:fs";
import path from "node:path";

export type ProviderTemplate = {
  command?: string;
  args?: string[];
  model?: string;
  baseUrl?: string;
  enabled?: boolean;
};

export type ProviderConfig = {
  providers: {
    claude_cli?: ProviderTemplate;
    codex_cli?: ProviderTemplate;
    ollama?: ProviderTemplate;
    copilot_cli?: ProviderTemplate;
  };
  roles?: {
    orchestrator?: string[];
    worker?: string[];
    validator?: string[];
    interview?: string[];
    profile?: string[];
  };
};

const DEFAULTS: ProviderConfig = {
  providers: {
    claude_cli: {
      command: "claude",
      args: ["--print", "--output-format", "text", "--no-session-persistence"],
      enabled: true,
    },
    codex_cli: {
      command: "codex",
      args: ["exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", "-"],
      enabled: true,
    },
    ollama: { model: "llama3.1:8b", baseUrl: "http://localhost:11434", enabled: true },
    copilot_cli: {
      command: "copilot",
      args: ["-p", "{{prompt}}", "--silent", "--stream", "off", "--no-auto-update", "--no-ask-user"],
      enabled: true,
    },
  },
  roles: {
    orchestrator: ["anthropic_api", "claude_cli", "codex_cli", "copilot_cli", "ollama"],
    worker: ["anthropic_api", "claude_cli", "codex_cli", "copilot_cli", "ollama"],
    validator: ["anthropic_api", "codex_cli", "claude_cli", "copilot_cli", "ollama"],
    interview: ["anthropic_api", "claude_cli", "codex_cli", "copilot_cli", "ollama"],
    profile: ["anthropic_api", "claude_cli", "codex_cli", "copilot_cli", "ollama"],
  },
};

let cached: ProviderConfig | null = null;
let cacheMtime = 0;

function configPath() {
  return path.join(process.cwd(), "skillproof.local.json");
}

export function loadProviderConfig(): ProviderConfig {
  const p = configPath();
  try {
    const stat = fs.statSync(p);
    if (cached && stat.mtimeMs === cacheMtime) return cached;
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<ProviderConfig>;
    const merged: ProviderConfig = {
      providers: { ...DEFAULTS.providers, ...(raw.providers ?? {}) },
      roles: { ...DEFAULTS.roles, ...(raw.roles ?? {}) },
    };
    cached = merged;
    cacheMtime = stat.mtimeMs;
    return merged;
  } catch {
    cached = DEFAULTS;
    cacheMtime = 0;
    return DEFAULTS;
  }
}

export function saveProviderConfig(cfg: ProviderConfig) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
  cached = null;
}

export const PROVIDER_DEFAULTS = DEFAULTS;
