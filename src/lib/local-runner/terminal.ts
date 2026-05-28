// Safe terminal command runner. Spawns child process, captures stdout/stderr,
// enforces timeout + max output. Returns transcript object.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { evaluatePolicy } from "./policies";
import { redact } from "./redact";
import type { CommandRun } from "./types";

export type RunOptions = {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: Record<string, string | undefined>;
  approved?: boolean;
  shell?: boolean;
  input?: string;
};

const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_MAX_OUTPUT = 256 * 1024;

function cmdQuote(value: string): string {
  const normalized = value.replace(/\r?\n/g, " ");
  if (/^[a-zA-Z0-9_./:\\-]+$/.test(normalized)) return normalized;
  return `"${normalized.replace(/(["^&|<>])/g, "^$1").replace(/%/g, "%%")}"`;
}

function prepareSpawn(command: string, args: string[], shell: boolean | undefined): {
  command: string;
  args: string[];
  shell: boolean;
} {
  if (shell !== undefined) return { command, args, shell };
  if (process.platform !== "win32") return { command, args, shell: false };

  // Windows package managers and global CLIs are commonly .cmd shims. Run them
  // through cmd.exe without Node's shell option so arguments are controlled.
  const line = [command, ...args].map(cmdQuote).join(" ");
  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", line],
    shell: false,
  };
}

function mergeEnv(overrides?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

export async function runCommand(opts: RunOptions): Promise<CommandRun> {
  const id = randomUUID();
  const command = opts.command;
  const args = opts.args ?? [];
  const cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
  const startedAt = new Date();

  const policy = evaluatePolicy({ command, args, approved: opts.approved });
  if (!policy.allowed) {
    return {
      id,
      command,
      args,
      cwd,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      exitCode: null,
      stdout: "",
      stderr: `blocked by policy: ${policy.reason}`,
      durationMs: 0,
      status: "blocked",
    };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;

  return new Promise<CommandRun>((resolve) => {
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let killed = false;
    let timedOut = false;

    let child;
    try {
      const spawnTarget = prepareSpawn(command, args, opts.shell);
      child = spawn(spawnTarget.command, spawnTarget.args, {
        cwd,
        env: mergeEnv(opts.env),
        shell: spawnTarget.shell,
        windowsHide: true,
      });
    } catch (err: any) {
      resolve({
        id,
        command,
        args,
        cwd,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        exitCode: null,
        stdout: "",
        stderr: redact(String(err?.message ?? err)),
        durationMs: 0,
        status: "error",
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killed = true;
      try {
        child.kill("SIGTERM");
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {}
        }, 2000);
      } catch {}
    }, timeoutMs);

    if (child.stdin) {
      try {
        if (opts.input) child.stdin.write(opts.input);
        child.stdin.end();
      } catch {}
    }

    child.stdout?.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      stdoutBytes += d.length;
      if (stdoutBytes < maxBytes) stdout += s;
      else if (!stdout.endsWith("…[truncated]")) stdout += "…[truncated]";
    });
    child.stderr?.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      stderrBytes += d.length;
      if (stderrBytes < maxBytes) stderr += s;
      else if (!stderr.endsWith("…[truncated]")) stderr += "…[truncated]";
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        id,
        command,
        args,
        cwd,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        exitCode: null,
        stdout: redact(stdout),
        stderr: redact(stderr + "\n" + String(err?.message ?? err)),
        durationMs: Date.now() - startedAt.getTime(),
        status: "error",
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const completedAt = new Date();
      const status = timedOut ? "timeout" : killed ? "error" : "completed";
      resolve({
        id,
        command,
        args,
        cwd,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        exitCode: code,
        stdout: redact(stdout),
        stderr: redact(stderr),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        status,
      });
    });
  });
}

export function summarize(text: string, max = 1200): string {
  if (!text) return "";
  if (text.length <= max) return text;
  const head = text.slice(0, Math.floor(max * 0.6));
  const tail = text.slice(-Math.floor(max * 0.3));
  return `${head}\n…[${text.length - head.length - tail.length} bytes truncated]…\n${tail}`;
}
