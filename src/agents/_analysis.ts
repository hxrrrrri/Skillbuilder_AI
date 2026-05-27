// Shared helper: build a token-efficient context block from a repo pack.
import type { RepoContextPack } from "./types";

export function buildContextBlock(pack: RepoContextPack, opts?: { includeSnippets?: boolean; maxSnippetChars?: number }) {
  const includeSnippets = opts?.includeSnippets ?? true;
  const maxChars = opts?.maxSnippetChars ?? 4000;

  const meta = `Repo: ${pack.meta.owner}/${pack.meta.repo}
Default branch: ${pack.meta.defaultBranch}
Language: ${pack.meta.primaryLanguage ?? "unknown"}
Framework: ${pack.detected.framework ?? "unknown"}
Test framework: ${pack.detected.testFramework ?? "none detected"}
Package manager: ${pack.detected.packageManager ?? "unknown"}
Has CI: ${pack.detected.hasCI}
Has Docker: ${pack.detected.hasDocker}
TypeScript: ${pack.detected.hasTypeScript}
Total files: ${pack.filesIndex.total}
Test files: ${pack.filesIndex.tests.length}
CI files: ${pack.filesIndex.ci.length}
Stars: ${pack.meta.stars}
Description: ${pack.meta.description ?? "(none)"}`;

  const importantList = `Important files (ranked):\n${pack.filesIndex.important.map((p) => "- " + p).join("\n") || "(none)"}`;
  const testList = `Test files:\n${pack.filesIndex.tests.slice(0, 20).map((p) => "- " + p).join("\n") || "(none)"}`;
  const ciList = `CI files:\n${pack.filesIndex.ci.map((p) => "- " + p).join("\n") || "(none)"}`;
  const intel = pack.intelligence
    ? `Deterministic repo intelligence:
Languages: ${Object.entries(pack.intelligence.languages).slice(0, 8).map(([k, v]) => `${k}=${v}`).join(", ") || "unknown"}
Frameworks: ${pack.intelligence.frameworks.join(", ") || "none"}
Package managers: ${pack.intelligence.packageManagers.join(", ") || pack.detected.packageManager || "unknown"}
Routes: ${pack.intelligence.routes.slice(0, 12).map((r) => `${r.route} (${r.file})`).join("; ") || "none"}
Components: ${pack.intelligence.components.slice(0, 12).map((c) => `${c.name} (${c.file})`).join("; ") || "none"}
Functions: ${pack.intelligence.functions.slice(0, 16).map((f) => `${f.name} (${f.file})`).join("; ") || "none"}
Schemas: ${pack.intelligence.schemas.slice(0, 12).map((s) => `${s.name}:${s.library} (${s.file})`).join("; ") || "none"}
API clients: ${pack.intelligence.apiClients.slice(0, 12).map((a) => `${a.kind} (${a.file})`).join("; ") || "none"}
Risk flags: ${pack.intelligence.riskFlags.slice(0, 12).map((r) => `${r.severity}:${r.reason}${r.file ? ` (${r.file})` : ""}`).join("; ") || "none"}`
    : "";

  let snippetsBlock = "";
  if (includeSnippets) {
    snippetsBlock =
      "Snippets:\n" +
      pack.snippets
        .map((s) => {
          const body = s.content.slice(0, maxChars);
          return `--- ${s.path} ${s.truncated ? "(truncated)" : ""}\n${body}`;
        })
        .join("\n\n");
  }

  return [meta, importantList, testList, ciList, intel, snippetsBlock].filter(Boolean).join("\n\n");
}

export function buildCommitsBlock(pack: RepoContextPack): string {
  if (!pack.commits.length) return "No commits available.";
  return (
    "Recent commits (sha — date — message):\n" +
    pack.commits
      .slice(0, 30)
      .map((c) => `${c.sha.slice(0, 7)} — ${c.date.slice(0, 10)} — ${c.message.split("\n")[0]}`)
      .join("\n")
  );
}
