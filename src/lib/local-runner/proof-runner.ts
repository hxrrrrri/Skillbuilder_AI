// Local Proof Runner — clones a repo into .skillproof/runs/<id> and runs
// safe checks (git log, package-manager install/test/build/typecheck/lint,
// pytest, security greps). Installs are policy-gated and never silent.

import fs from "node:fs";
import path from "node:path";
import { runCommand, summarize } from "./terminal";
import { runsRoot } from "./workspace";
import type { LocalProofPolicy, TerminalEvidence } from "./types";

export type ProofResult = {
  workspace: string;
  cloned: boolean;
  reused: boolean;
  evidence: TerminalEvidence[];
  detected: {
    packageManager: "npm" | "pnpm" | "yarn" | "bun" | null;
    hasNode: boolean;
    hasPython: boolean;
    hasNodeModules: boolean;
    installStatus: "not_needed" | "disabled" | "pending_approval" | "completed" | "failed" | "skipped";
    hasTests: boolean;
    hasBuild: boolean;
    hasTypecheck: boolean;
    hasLint: boolean;
    framework: string | null;
  };
  ownership: {
    owner_match: boolean;
    repo_token_verified: boolean;
    self_declared: boolean;
    gh_user?: string | null;
  };
};

const CLONE_TIMEOUT_MS = 90_000;
const GIT_INFO_TIMEOUT_MS = 15_000;

export function defaultLocalProofPolicy(opts?: Partial<LocalProofPolicy>): LocalProofPolicy {
  return {
    allowInstall: false,
    installRequiresApproval: true,
    installApproved: false,
    maxInstallMs: 240_000,
    maxCommandMs: 180_000,
    networkAllowed: false,
    packageManagersAllowed: ["npm", "pnpm", "yarn", "bun"],
    workspaceRoot: runsRoot(),
    ...opts,
  };
}

function evidenceFrom(
  run: Awaited<ReturnType<typeof runCommand>>,
  usedFor: TerminalEvidence["usedFor"],
  statusLabel?: TerminalEvidence["statusLabel"],
): TerminalEvidence {
  return {
    command: [run.command, ...run.args].join(" "),
    cwd: run.cwd,
    exitCode: run.exitCode,
    stdoutSummary: summarize(run.stdout, 1200),
    stderrSummary: summarize(run.stderr, 800),
    durationMs: run.durationMs,
    usedFor,
    statusLabel: statusLabel ?? (run.exitCode === 0 ? "passed" : run.exitCode === null ? undefined : "failed"),
  };
}

function detectPackageManager(workspace: string): "npm" | "pnpm" | "yarn" | "bun" | null {
  if (fs.existsSync(path.join(workspace, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(workspace, "bun.lockb")) || fs.existsSync(path.join(workspace, "bun.lock"))) return "bun";
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

function pmRun(pm: "npm" | "pnpm" | "yarn" | "bun" | null, script: string): { command: string; args: string[] } | null {
  switch (pm) {
    case "pnpm":
      return { command: "pnpm", args: ["run", script] };
    case "yarn":
      return { command: "yarn", args: [script] };
    case "bun":
      return { command: "bun", args: ["run", script] };
    case "npm":
      return { command: "npm", args: ["run", script, "--if-present"] };
    default:
      return null;
  }
}

function pmInstall(pm: "npm" | "pnpm" | "yarn" | "bun" | null, workspace: string): { command: string; args: string[] } | null {
  switch (pm) {
    case "npm":
      return fs.existsSync(path.join(workspace, "package-lock.json"))
        ? { command: "npm", args: ["ci"] }
        : { command: "npm", args: ["install"] };
    case "pnpm":
      return { command: "pnpm", args: ["install", "--frozen-lockfile"] };
    case "yarn":
      return { command: "yarn", args: ["install", "--frozen-lockfile"] };
    case "bun":
      return { command: "bun", args: ["install", "--frozen-lockfile"] };
    default:
      return null;
  }
}

function skippedEvidence(args: {
  command: string;
  cwd: string;
  usedFor: TerminalEvidence["usedFor"];
  reason: string;
  statusLabel?: TerminalEvidence["statusLabel"];
}): TerminalEvidence {
  return {
    command: args.command,
    cwd: args.cwd,
    exitCode: null,
    stdoutSummary: args.reason,
    stderrSummary: "",
    durationMs: 0,
    usedFor: args.usedFor,
    statusLabel: args.statusLabel ?? "skipped",
  };
}

// Quick grep for obvious security risks (uses `git grep` so .gitignore is respected).
async function securityScan(workspace: string, evidence: TerminalEvidence[]) {
  const patterns: Array<{ label: string; regex: string }> = [
    { label: "secret tokens", regex: "sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}" },
    { label: "eval(", regex: "\\beval\\(" },
    { label: "dangerouslySetInnerHTML", regex: "dangerouslySetInnerHTML" },
    { label: "process.env dump", regex: "console\\.log\\(.*process\\.env|JSON\\.stringify\\(process\\.env" },
  ];
  for (const p of patterns) {
    const r = await runCommand({
      command: "git",
      args: ["grep", "-In", "-E", p.regex],
      cwd: workspace,
      timeoutMs: 8000,
      approved: true,
    });
    if (r.exitCode === 0 && r.stdout.trim().length > 0) {
      evidence.push({
        command: `git grep · ${p.label}`,
        cwd: r.cwd,
        exitCode: 0,
        stdoutSummary: summarize(r.stdout, 800),
        stderrSummary: summarize(r.stderr, 200),
        durationMs: r.durationMs,
        usedFor: "security",
      });
    }
  }
}

export async function runProof(opts: {
  runId: string;
  repoUrl: string;
  githubUsername?: string | null;
  repoOwner: string;
  ownershipToken?: string | null;
  policy?: Partial<LocalProofPolicy>;
  timeoutMs?: number;
}): Promise<ProofResult> {
  const evidence: TerminalEvidence[] = [];
  const policy = defaultLocalProofPolicy(opts.policy);
  const workspace = path.join(policy.workspaceRoot, opts.runId);
  fs.mkdirSync(path.dirname(workspace), { recursive: true });

  let cloned = false;
  let reused = false;
  if (!fs.existsSync(workspace)) {
    const clone = await runCommand({
      command: "git",
      args: ["clone", "--depth", "50", "--single-branch", opts.repoUrl, workspace],
      timeoutMs: opts.timeoutMs ?? CLONE_TIMEOUT_MS,
      approved: true,
    });
    evidence.push(evidenceFrom(clone, "git"));
    cloned = clone.exitCode === 0;
  } else {
    cloned = true;
    reused = true;
    // Reused workspace marker.
    evidence.push({
      command: `# reused workspace`,
      cwd: workspace,
      exitCode: 0,
      stdoutSummary: `Workspace ${workspace} already existed — reusing without re-clone.`,
      stderrSummary: "",
      durationMs: 0,
      usedFor: "git",
    });
  }

  if (!cloned || !fs.existsSync(workspace)) {
    return {
      workspace,
      cloned: false,
      reused: false,
      evidence,
      detected: {
        packageManager: null,
        hasNode: false,
        hasPython: false,
        hasNodeModules: false,
        installStatus: "skipped",
        hasTests: false,
        hasBuild: false,
        hasTypecheck: false,
        hasLint: false,
        framework: null,
      },
      ownership: { owner_match: false, repo_token_verified: false, self_declared: !!opts.githubUsername, gh_user: null },
    };
  }

  // git log / shortlog / branch / status / remote with token redaction.
  for (const args of [
    ["log", "--oneline", "-n", "30"],
    ["shortlog", "-sn", "-n", "--all"],
    ["branch", "--show-current"],
    ["status", "--short"],
    ["remote", "-v"],
  ]) {
    const r = await runCommand({
      command: "git",
      args,
      cwd: workspace,
      timeoutMs: GIT_INFO_TIMEOUT_MS,
      approved: true,
    });
    evidence.push(evidenceFrom(r, "git"));
  }

  const pkgPath = path.join(workspace, "package.json");
  const pkg = readJsonSafe(pkgPath);
  const hasNode = !!pkg;
  let hasNodeModules = hasNode && fs.existsSync(path.join(workspace, "node_modules"));
  const hasPython =
    fs.existsSync(path.join(workspace, "pyproject.toml")) ||
    fs.existsSync(path.join(workspace, "requirements.txt"));
  const packageManager = hasNode ? detectPackageManager(workspace) : null;
  const scripts = pkg?.scripts ?? {};
  const hasTests = !!scripts.test || fs.existsSync(path.join(workspace, "vitest.config.ts")) || fs.existsSync(path.join(workspace, "jest.config.js"));
  const hasBuild = !!scripts.build;
  const hasTypecheck = !!scripts.typecheck || !!scripts["type-check"] || fs.existsSync(path.join(workspace, "tsconfig.json"));
  const hasLint = !!scripts.lint;
  const framework = detectFramework(pkg);
  let installStatus: ProofResult["detected"]["installStatus"] = hasNodeModules ? "not_needed" : "skipped";

  // JS dependency install is policy-gated. Missing deps are never treated as proof.
  if (hasNode && !hasNodeModules) {
    if (!policy.allowInstall) {
      installStatus = "disabled";
      evidence.push(skippedEvidence({
        command: "# install disabled",
        cwd: workspace,
        usedFor: "install",
        reason: "node_modules missing and install is disabled by local proof policy.",
      }));
    } else if (!policy.networkAllowed) {
      installStatus = "skipped";
      evidence.push(skippedEvidence({
        command: "# install skipped",
        cwd: workspace,
        usedFor: "install",
        reason: "node_modules missing but network access is disabled by local proof policy.",
      }));
    } else if (policy.installRequiresApproval && !policy.installApproved) {
      installStatus = "pending_approval";
      evidence.push(skippedEvidence({
        command: "# install pending approval",
        cwd: workspace,
        usedFor: "install",
        reason: "node_modules missing — dependency install requires candidate approval before tests/build/typecheck can run.",
        statusLabel: "install_pending_approval",
      }));
    } else if (!packageManager || !policy.packageManagersAllowed.includes(packageManager)) {
      installStatus = "skipped";
      evidence.push(skippedEvidence({
        command: "# install skipped",
        cwd: workspace,
        usedFor: "install",
        reason: `Package manager ${packageManager ?? "unknown"} is not allowed by local proof policy.`,
      }));
    } else {
      const install = pmInstall(packageManager, workspace);
      if (install) {
        const r = await runCommand({
          ...install,
          cwd: workspace,
          timeoutMs: policy.maxInstallMs,
          approved: true,
          env: { CI: "1" },
        });
        installStatus = r.exitCode === 0 ? "completed" : "failed";
        evidence.push(evidenceFrom(r, "install", r.exitCode === 0 ? "install_completed" : "failed"));
        hasNodeModules = fs.existsSync(path.join(workspace, "node_modules"));
      }
    }
    if (!hasNodeModules) {
      evidence.push(skippedEvidence({
        command: "# skipped node scripts",
        cwd: workspace,
        usedFor: "testing",
        reason: "Dependencies missing — test/build/typecheck/lint were skipped and must not be treated as terminal proof.",
      }));
    }
  }

  // testing
  if (hasNode && hasNodeModules && (scripts.test || scripts["test:ci"])) {
    const script = scripts["test:ci"] ? "test:ci" : "test";
    const cmd = pmRun(packageManager, script);
    if (cmd) {
      const t = await runCommand({
        ...cmd,
        cwd: workspace,
        timeoutMs: policy.maxCommandMs,
        approved: true,
        env: { CI: "1" },
      });
      evidence.push(evidenceFrom(t, "testing"));
    }
  } else if (hasNode && hasNodeModules) {
    evidence.push(skippedEvidence({
      command: "# no npm test script",
      cwd: workspace,
      usedFor: "testing",
      reason: "No test script detected in package.json.",
    }));
  } else if (hasPython) {
    // Only run pytest if it's importable; non-fatal if not.
    const py = await runCommand({
      command: "python",
      args: ["-m", "pytest", "-q", "--maxfail=5"],
      cwd: workspace,
      timeoutMs: policy.maxCommandMs,
      approved: true,
    });
    evidence.push(evidenceFrom(py, "testing"));
  }

  // build
  if (hasNode && hasNodeModules && scripts.build) {
    const cmd = pmRun(packageManager, "build");
    if (cmd) {
      const b = await runCommand({
        ...cmd,
        cwd: workspace,
        timeoutMs: policy.maxCommandMs,
        approved: true,
      });
      evidence.push(evidenceFrom(b, "build"));
    }
  } else if (hasNode && hasNodeModules) {
    evidence.push(skippedEvidence({
      command: "# no build script",
      cwd: workspace,
      usedFor: "build",
      reason: "No build script detected in package.json.",
    }));
  }

  // typecheck — prefer script. If only tsconfig and local tsc exists, use it; otherwise skip.
  if (hasNode && hasNodeModules && (scripts.typecheck || scripts["type-check"])) {
    const tcScript = scripts.typecheck ? "typecheck" : "type-check";
    const cmd = pmRun(packageManager, tcScript);
    if (cmd) {
      const tc = await runCommand({
        ...cmd,
        cwd: workspace,
        timeoutMs: policy.maxCommandMs,
        approved: true,
      });
      evidence.push(evidenceFrom(tc, "typecheck"));
    }
  } else if (hasNode && hasNodeModules && fs.existsSync(path.join(workspace, "tsconfig.json"))) {
    const localTsc = path.join(workspace, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
    if (fs.existsSync(localTsc)) {
      const tc = await runCommand({
        command: localTsc,
        args: ["--noEmit"],
        cwd: workspace,
        timeoutMs: policy.maxCommandMs,
        approved: true,
      });
      evidence.push(evidenceFrom(tc, "typecheck"));
    } else {
      evidence.push(skippedEvidence({
        command: "# typecheck skipped",
        cwd: workspace,
        usedFor: "typecheck",
        reason: "tsconfig.json exists but no local tsc binary was found.",
      }));
    }
  } else if (hasNode && hasNodeModules) {
    evidence.push(skippedEvidence({
      command: "# no typecheck script",
      cwd: workspace,
      usedFor: "typecheck",
      reason: "No typecheck script or tsconfig.json detected.",
    }));
  }

  if (hasNode && hasNodeModules && hasLint) {
    const cmd = pmRun(packageManager, "lint");
    if (cmd) {
      const lint = await runCommand({
        ...cmd,
        cwd: workspace,
        timeoutMs: policy.maxCommandMs,
        approved: true,
        env: { CI: "1" },
      });
      evidence.push(evidenceFrom(lint, "lint"));
    }
  } else if (hasNode && hasNodeModules) {
    evidence.push(skippedEvidence({
      command: "# no lint script",
      cwd: workspace,
      usedFor: "lint",
      reason: "No lint script detected in package.json.",
    }));
  }

  // Security grep scans.
  try {
    await securityScan(workspace, evidence);
  } catch {
    // Non-fatal.
  }

  // Ownership: gh auth status user vs repo owner.
  let owner_match = false;
  let gh_user: string | null = null;
  try {
    const who = await runCommand({
      command: "gh",
      args: ["api", "user", "-q", ".login"],
      timeoutMs: 8000,
      approved: true,
    });
    if (who.exitCode === 0) {
      const login = who.stdout.trim();
      gh_user = login || null;
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
      const tag = opts.ownershipToken ?? `skillproof:${opts.githubUsername}`;
      if (txt.toLowerCase().includes(tag.toLowerCase())) repo_token_verified = true;
    }
    const verifyFile = path.join(workspace, ".skillproof-verify.json");
    if (!repo_token_verified && fs.existsSync(verifyFile)) {
      const txt = fs.readFileSync(verifyFile, "utf8");
      const tag = opts.ownershipToken ?? (opts.githubUsername ? `skillproof:${opts.githubUsername}` : "");
      if (tag && txt.toLowerCase().includes(tag.toLowerCase())) repo_token_verified = true;
    }
  } catch {}

  return {
    workspace,
    cloned: true,
    reused,
    evidence,
    detected: { packageManager, hasNode, hasPython, hasNodeModules, installStatus, hasTests, hasBuild, hasTypecheck, hasLint, framework },
    ownership: {
      owner_match,
      repo_token_verified,
      self_declared: !!opts.githubUsername && !owner_match && !repo_token_verified,
      gh_user,
    },
  };
}
