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

  return [meta, importantList, testList, ciList, snippetsBlock].filter(Boolean).join("\n\n");
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
