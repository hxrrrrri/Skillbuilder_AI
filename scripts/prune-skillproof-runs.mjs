#!/usr/bin/env node
// Prune local-runner working directories under .skillproof/runs.
// Each run clones a repo and installs deps, so this dir grows without bound
// (observed >1GB). Keeps the newest N run dirs and deletes the rest.
//
// Usage:
//   node scripts/prune-skillproof-runs.mjs            # keep newest 3
//   node scripts/prune-skillproof-runs.mjs --keep 5   # keep newest 5
//   SKILLPROOF_KEEP_RUNS=0 node scripts/...           # delete all
import { rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const RUNS_DIR = join(process.cwd(), ".skillproof", "runs");

function parseKeep() {
  const flagIdx = process.argv.indexOf("--keep");
  if (flagIdx !== -1 && process.argv[flagIdx + 1] != null) {
    return Number(process.argv[flagIdx + 1]);
  }
  if (process.env.SKILLPROOF_KEEP_RUNS != null) {
    return Number(process.env.SKILLPROOF_KEEP_RUNS);
  }
  return 3;
}

async function main() {
  const keep = parseKeep();
  if (!Number.isFinite(keep) || keep < 0) {
    console.error(`[prune] invalid keep value: ${keep}`);
    process.exit(1);
  }

  let entries;
  try {
    entries = await readdir(RUNS_DIR, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.log("[prune] no .skillproof/runs directory; nothing to do.");
      return;
    }
    throw err;
  }

  const dirs = entries.filter((e) => e.isDirectory());
  const withTime = await Promise.all(
    dirs.map(async (d) => {
      const full = join(RUNS_DIR, d.name);
      const s = await stat(full);
      return { full, name: d.name, mtime: s.mtimeMs };
    }),
  );
  withTime.sort((a, b) => b.mtime - a.mtime); // newest first

  const toDelete = withTime.slice(keep);
  if (toDelete.length === 0) {
    console.log(`[prune] ${withTime.length} run dir(s); within keep=${keep}. Nothing to delete.`);
    return;
  }

  for (const d of toDelete) {
    await rm(d.full, { recursive: true, force: true });
    console.log(`[prune] removed ${d.name}`);
  }
  console.log(`[prune] kept ${Math.min(keep, withTime.length)}, removed ${toDelete.length}.`);
}

main().catch((err) => {
  console.error("[prune] failed", err);
  process.exit(1);
});
