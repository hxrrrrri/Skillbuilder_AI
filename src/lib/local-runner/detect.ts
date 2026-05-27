// Detect locally installed CLI tools. Never throws — missing tool returns installed:false.

import { runCommand } from "./terminal";
import type { DetectedTool, DetectionReport, ExecutionMode } from "./types";

async function probe(command: string, args: string[], timeoutMs = 5000) {
  try {
    return await runCommand({ command, args, timeoutMs, approved: true });
  } catch (err: any) {
    return {
      id: "err",
      command,
      args,
      cwd: process.cwd(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      exitCode: null,
      stdout: "",
      stderr: String(err?.message ?? err),
      durationMs: 0,
      status: "error" as const,
    };
  }
}

function firstLine(s: string): string {
  return (s || "").split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
}

async function detectGit(): Promise<DetectedTool> {
  const r = await probe("git", ["--version"]);
  const installed = r.exitCode === 0;
  return {
    name: "git",
    installed,
    command: "git",
    version: installed ? firstLine(r.stdout) : null,
    authenticated: installed,
    authStatus: installed ? "local binary" : null,
    capabilities: installed ? ["git", "shell"] : [],
    setupHint: installed ? undefined : "Install Git from https://git-scm.com/downloads",
    error: installed ? null : r.stderr || "git not found",
  };
}

async function detectGh(): Promise<DetectedTool> {
  const v = await probe("gh", ["--version"]);
  const installed = v.exitCode === 0;
  if (!installed) {
    return {
      name: "gh",
      installed: false,
      command: "gh",
      version: null,
      authenticated: false,
      authStatus: null,
      capabilities: [],
      setupHint: "Install GitHub CLI from https://cli.github.com/",
      error: v.stderr || "gh not found",
    };
  }
  const auth = await probe("gh", ["auth", "status"], 7000);
  const authText = `${auth.stdout}\n${auth.stderr}`;
  const authenticated = auth.exitCode === 0 && /Logged in to/i.test(authText);
  return {
    name: "gh",
    installed: true,
    command: "gh",
    version: firstLine(v.stdout),
    authenticated,
    authStatus: authenticated ? firstLine(authText.replace(/^[^A-Za-z]+/gm, "")) : "not authenticated",
    capabilities: authenticated ? ["github_api", "github_auth", "shell"] : ["shell"],
    setupHint: authenticated ? undefined : "Run `gh auth login` to authenticate.",
  };
}

async function detectClaude(): Promise<DetectedTool> {
  const r = await probe("claude", ["--version"]);
  const installed = r.exitCode === 0;
  return {
    name: "claude",
    installed,
    command: "claude",
    version: installed ? firstLine(r.stdout) : null,
    authenticated: installed,
    authStatus: installed ? "binary present" : null,
    capabilities: installed ? ["llm", "shell"] : [],
    setupHint: installed ? undefined : "Install Claude Code from https://claude.com/claude-code",
    error: installed ? null : r.stderr || "claude CLI not found",
  };
}

async function detectCodex(): Promise<DetectedTool> {
  const r = await probe("codex", ["--version"]);
  const installed = r.exitCode === 0;
  return {
    name: "codex",
    installed,
    command: "codex",
    version: installed ? firstLine(r.stdout) : null,
    authenticated: installed,
    authStatus: installed ? "binary present" : null,
    capabilities: installed ? ["llm", "shell"] : [],
    setupHint: installed ? undefined : "Install OpenAI Codex CLI (e.g. `npm i -g @openai/codex`).",
    error: installed ? null : r.stderr || "codex CLI not found",
  };
}

async function detectOllama(): Promise<DetectedTool> {
  const v = await probe("ollama", ["--version"]);
  const installed = v.exitCode === 0;
  if (!installed) {
    return {
      name: "ollama",
      installed: false,
      command: "ollama",
      version: null,
      authenticated: false,
      authStatus: null,
      capabilities: [],
      setupHint: "Install Ollama from https://ollama.com/download",
      error: v.stderr || "ollama not found",
    };
  }
  const list = await probe("ollama", ["list"], 5000);
  const hasModels = /\b\w+:[A-Za-z0-9._-]+/.test(list.stdout);
  return {
    name: "ollama",
    installed: true,
    command: "ollama",
    version: firstLine(v.stdout),
    authenticated: hasModels,
    authStatus: hasModels ? "models available" : "no models pulled",
    capabilities: hasModels ? ["llm", "llm_local"] : ["llm_local"],
    setupHint: hasModels ? undefined : "Pull a model, e.g. `ollama pull llama3.1:8b`.",
  };
}

async function detectCopilot(): Promise<DetectedTool> {
  // Optional. Try `gh copilot --version` first, then `copilot --version`.
  const ghCopilot = await probe("gh", ["copilot", "--version"], 4000);
  if (ghCopilot.exitCode === 0) {
    return {
      name: "copilot",
      installed: true,
      command: "gh copilot",
      version: firstLine(ghCopilot.stdout),
      authenticated: true,
      authStatus: "via gh",
      capabilities: ["llm", "shell"],
    };
  }
  const r = await probe("copilot", ["--version"], 4000);
  const installed = r.exitCode === 0;
  return {
    name: "copilot",
    installed,
    command: "copilot",
    version: installed ? firstLine(r.stdout) : null,
    authenticated: installed,
    authStatus: installed ? "binary present" : null,
    capabilities: installed ? ["llm", "shell"] : [],
    setupHint: installed ? undefined : "Optional. Install GitHub Copilot CLI: `gh extension install github/gh-copilot`.",
  };
}

export async function detectAllTools(): Promise<DetectionReport> {
  const tools = await Promise.all([
    detectGit(),
    detectGh(),
    detectClaude(),
    detectCodex(),
    detectOllama(),
    detectCopilot(),
  ]);

  const hasApi = !!process.env.ANTHROPIC_API_KEY;
  const hasLocalLLM = tools.some(
    (t) => (t.name === "claude" || t.name === "codex" || t.name === "ollama") && t.installed && t.authenticated,
  );
  const hasGit = tools.find((t) => t.name === "git")?.installed ?? false;

  let recommendedMode: ExecutionMode = "mock";
  const reasons: string[] = [];
  if (hasApi && hasLocalLLM && hasGit) {
    recommendedMode = "hybrid";
    reasons.push("API key + local CLI + git present → hybrid mode");
  } else if (hasLocalLLM && hasGit) {
    recommendedMode = "cli";
    reasons.push("Local LLM CLI + git detected → run fully local");
  } else if (hasApi) {
    recommendedMode = "api";
    reasons.push("API key set, no local LLM CLI → cloud API mode");
  } else {
    recommendedMode = "mock";
    reasons.push("No API key and no local LLM CLI → heuristic/mock mode");
  }

  return {
    detectedAt: new Date().toISOString(),
    platform: process.platform,
    tools,
    recommendedMode,
    reasons,
  };
}
