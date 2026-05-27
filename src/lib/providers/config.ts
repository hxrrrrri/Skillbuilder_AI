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
    claude_cli: { command: "claude", args: ["-p", "{{prompt}}"], enabled: true },
    codex_cli: { command: "codex", args: ["exec", "{{prompt}}"], enabled: true },
    ollama: { model: "llama3.1:8b", baseUrl: "http://localhost:11434", enabled: true },
    copilot_cli: { command: "gh", args: ["copilot", "suggest", "{{prompt}}"], enabled: false },
  },
  roles: {
    orchestrator: ["claude_cli", "anthropic_api", "ollama", "mock"],
    worker: ["ollama", "claude_cli", "codex_cli", "anthropic_api", "mock"],
    validator: ["codex_cli", "anthropic_api", "claude_cli", "ollama", "mock"],
    interview: ["claude_cli", "anthropic_api", "ollama", "mock"],
    profile: ["anthropic_api", "claude_cli", "ollama", "mock"],
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
