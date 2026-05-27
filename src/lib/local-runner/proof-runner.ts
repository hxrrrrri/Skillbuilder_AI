// Local Proof Runner — clones a repo into .skillproof/runs/<id> and runs
// safe checks (git log, package-manager test/build/typecheck, pytest).

import fs from "node:fs";
import path from "node:path";
import { runCommand, summarize } from "./terminal";
import type { TerminalEvidence } from "./types";

export type ProofResult = {
  workspace: string;
  cloned: boolean;
  evidence: TerminalEvidence[];
  detected: {
    packageManager: "npm" | "pnpm" | "yarn" | "bun" | null;
    hasNode: boolean;
    hasPython: boolean;
    hasTests: boolean;
    hasBuild: boolean;
    hasTypecheck: boolean;
    framework: string | null;
  };
  ownership: {
    owner_match: boolean;
    repo_token_verified: boolean;
    self_declared: boolean;
  };
};

const SKIPROOF_HOME = ".skillproof";

function evidenceFrom(
  run: Awaited<ReturnType<typeof runCommand>>,
  usedFor: TerminalEvidence["usedFor"],
): TerminalEvidence {
  return {
    command: [run.command, ...run.args].join(" "),
    cwd: run.cwd,
    exitCode: run.exitCode,
    stdoutSummary: summarize(run.stdout, 1200),
    stderrSummary: summarize(run.stderr, 800),
    durationMs: run.durationMs,
    usedFor,
  };
}

function detectPackageManager(workspace: string): "npm" | "pnpm" | "yarn" | "bun" | null {
  if (fs.existsSync(path.join(workspace, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(workspace, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(workspace, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(workspace, "package-lock.json"))) return "npm";
  if (fs.existsSync(path.join(workspace, "package.json"))) return "npm";
  return null;
}

function readJsonSafe(p: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function detectFramework(pkg: any | null): string | null {
  if (!pkg) return null;
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (deps.next) return "next";
  if (deps.react) return "react";
  if (deps.vue) return "vue";
  if (deps.svelte) return "svelte";
  if (deps.express) return "express";
  if (deps.fastify) return "fastify";
  return null;
}

function workspaceFor(runId: string): string {
  return path.join(process.cwd(), SKIPROOF_HOME, "runs", runId);
}

export async function runProof(opts: {
  runId: string;
  repoUrl: string;
  githubUsername?: string | null;
  repoOwner: string;
  timeoutMs?: number;
}): Promise<ProofResult> {
  const evidence: TerminalEvidence[] = [];
  const workspace = workspaceFor(opts.runId);
  fs.mkdirSync(path.dirname(workspace), { recursive: true });

  let cloned = false;
  if (!fs.existsSync(workspace)) {
    const clone = await runCommand({
      command: "git",
      args: ["clone", "--depth", "50", "--single-branch", opts.repoUrl, workspace],
      timeoutMs: opts.timeoutMs ?? 120_000,
      approved: true,
    });
    evidence.push(evidenceFrom(clone, "git"));
    cloned = clone.exitCode === 0;
  } else {
    cloned = true;
  }

  if (!cloned || !fs.existsSync(workspace)) {
    return {
      workspace,
      cloned: false,
      evidence,
      detected: {
        packageManager: null,
        hasNode: false,
        hasPython: false,
        hasTests: false,
        hasBuild: false,
        hasTypecheck: false,
        framework: null,
      },
      ownership: { owner_match: false, repo_token_verified: false, self_declared: !!opts.githubUsername },
    };
  }

  // git log evidence
  const log = await runCommand({
    command: "git",
    args: ["log", "--oneline", "-n", "30"],
    cwd: workspace,
    timeoutMs: 15_000,
    approved: true,
  });
  evidence.push(evidenceFrom(log, "git"));

  const shortlog = await runCommand({
    command: "git",
    args: ["shortlog", "-sn", "-n", "--all"],
    cwd: workspace,
    timeoutMs: 15_000,
    approved: true,
  });
  evidence.push(evidenceFrom(shortlog, "git"));

  const pkgPath = path.join(workspace, "package.json");
  const pkg = readJsonSafe(pkgPath);
  const hasNode = !!pkg;
  const hasPython =
    fs.existsSync(path.join(workspace, "pyproject.toml")) ||
    fs.existsSync(path.join(workspace, "requirements.txt"));
  const packageManager = hasNode ? detectPackageManager(workspace) : null;
  const scripts = pkg?.scripts ?? {};
  const hasTests = !!scripts.test || fs.existsSync(path.join(workspace, "vitest.config.ts")) || fs.existsSync(path.join(workspace, "jest.config.js"));
  const hasBuild = !!scripts.build;
  const hasTypecheck = !!scripts.typecheck || !!scripts["type-check"] || fs.existsSync(path.join(workspace, "tsconfig.json"));
  const framework = detectFramework(pkg);

  const pmRun = (script: string) => {
    switch (packageManager) {
      case "pnpm":
        return { command: "pnpm", args: ["run", script] };
      case "yarn":
        return { command: "yarn", args: [script] };
      case "bun":
        return { command: "bun", args: ["run", script] };
      case "npm":
      default:
        return { command: "npm", args: ["run", script, "--if-present"] };
    }
  };

  // testing
  if (hasNode && (scripts.test || scripts["test:ci"])) {
    const script = scripts["test:ci"] ? "test:ci" : "test";
    const { command, args } = pmRun(script);
    const t = await runCommand({
      command,
      args,
      cwd: workspace,
      timeoutMs: 180_000,
      approved: true,
      env: { CI: "1" },
    });
    evidence.push(evidenceFrom(t, "testing"));
  } else if (hasPython) {
    const py = await runCommand({
      command: "python",
      args: ["-m", "pytest", "-q", "--maxfail=5"],
      cwd: workspace,
      timeoutMs: 180_000,
      approved: true,
    });
    evidence.push(evidenceFrom(py, "testing"));
  }

  // build
  if (hasNode && scripts.build) {
    const { command, args } = pmRun("build");
    const b = await runCommand({
      command,
      args,
      cwd: workspace,
      timeoutMs: 240_000,
      approved: true,
    });
    evidence.push(evidenceFrom(b, "build"));
  }

  // typecheck
  if (hasNode && (scripts.typecheck || scripts["type-check"])) {
    const tcScript = scripts.typecheck ? "typecheck" : "type-check";
    const { command, args } = pmRun(tcScript);
    const tc = await runCommand({
      command,
      args,
      cwd: workspace,
      timeoutMs: 120_000,
      approved: true,
    });
    evidence.push(evidenceFrom(tc, "typecheck"));
  } else if (hasNode && fs.existsSync(path.join(workspace, "tsconfig.json"))) {
    const tc = await runCommand({
      command: "npx",
      args: ["--yes", "tsc", "--noEmit"],
      cwd: workspace,
      timeoutMs: 120_000,
      approved: true,
    });
    evidence.push(evidenceFrom(tc, "typecheck"));
  }

  // Ownership: gh auth status user vs repo owner
  let owner_match = false;
  try {
    const who = await runCommand({
      command: "gh",
      args: ["api", "user", "-q", ".login"],
      timeoutMs: 8000,
      approved: true,
    });
    if (who.exitCode === 0) {
      const login = who.stdout.trim();
      if (login && login.toLowerCase() === opts.repoOwner.toLowerCase()) owner_match = true;
    }
    evidence.push(evidenceFrom(who, "ownership"));
  } catch {}

  let repo_token_verified = false;
  try {
    const readme = ["README.md", "README", "readme.md"]
      .map((f) => path.join(workspace, f))
      .find((p) => fs.existsSync(p));
    if (readme && opts.githubUsername) {
      const txt = fs.readFileSync(readme, "utf8");
      const tag = `skillproof:${opts.githubUsername}`;
      if (txt.toLowerCase().includes(tag.toLowerCase())) repo_token_verified = true;
    }
  } catch {}

  return {
    workspace,
    cloned: true,
    evidence,
    detected: { packageManager, hasNode, hasPython, hasTests, hasBuild, hasTypecheck, framework },
    ownership: {
      owner_match,
      repo_token_verified,
      self_declared: !!opts.githubUsername && !owner_match && !repo_token_verified,
    },
  };
}
