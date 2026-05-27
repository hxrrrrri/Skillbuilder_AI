import fs from "node:fs";
import path from "node:path";

export const SKILLPROOF_HOME = ".skillproof";

export function runsRoot(root = process.cwd()): string {
  return path.resolve(root, SKILLPROOF_HOME, "runs");
}

export function safeRunId(runId: string | undefined | null): string {
  const raw = (runId || "manual").trim();
  return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : "invalid";
}

export function workspaceForRun(runId: string, root = process.cwd()): string {
  return path.join(runsRoot(root), safeRunId(runId));
}

export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function resolveSafeRunCwd(rawCwd: string | undefined, runId: string | undefined): {
  ok: true;
  cwd: string;
  workspace: string;
} | { ok: false; reason: string } {
  const id = safeRunId(runId);
  if (id === "invalid") return { ok: false, reason: "invalid run id" };
  const workspace = workspaceForRun(id);
  fs.mkdirSync(workspace, { recursive: true });

  if (!rawCwd) return { ok: true, cwd: workspace, workspace };

  const abs = path.resolve(rawCwd);
  if (!isInside(workspace, abs)) {
    return { ok: false, reason: `cwd "${abs}" is outside run workspace ${workspace}` };
  }
  return { ok: true, cwd: abs, workspace };
}

