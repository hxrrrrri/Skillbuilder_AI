// Deterministic non-LLM agent. Saves tokens by doing all this work outside the model.
import {
  detectCIFiles,
  detectConfigFiles,
  detectReadme,
  detectTestFiles,
  getCommits,
  getFile,
  getRepoMeta,
  getTree,
  rankImportantFiles,
} from "@/lib/github";
import { estimateBytesTokens, estimateTokens } from "@/lib/token-meter";
import { snippetHash } from "@/lib/evidence";
import { buildRepoIntelligenceIndex } from "@/lib/repo-intelligence";
import type { Handoff, MissionState, RepoContextPack } from "./types";

const MAX_SNIPPET_BYTES = 8000;
const MAX_README_BYTES = 12000;

function detectFramework(packageJson: string | null, tree: string[]): string | null {
  if (packageJson) {
    const j = packageJson.toLowerCase();
    if (j.includes('"next"')) return "Next.js";
    if (j.includes('"nuxt"')) return "Nuxt";
    if (j.includes('"react"')) return "React";
    if (j.includes('"vue"')) return "Vue";
    if (j.includes('"svelte"')) return "Svelte";
    if (j.includes('"express"')) return "Express";
    if (j.includes('"fastify"')) return "Fastify";
    if (j.includes('"nestjs"') || j.includes('"@nestjs/core"')) return "NestJS";
  }
  if (tree.some((p) => p === "requirements.txt" || p === "pyproject.toml")) {
    if (tree.some((p) => /(^|\/)manage\.py$/.test(p))) return "Django";
    if (tree.some((p) => /(^|\/)app\.py$/.test(p))) return "Flask";
    return "Python";
  }
  if (tree.some((p) => p === "go.mod")) return "Go";
  if (tree.some((p) => p === "Cargo.toml")) return "Rust";
  return null;
}

function detectPackageManager(tree: string[]): string | null {
  if (tree.includes("pnpm-lock.yaml")) return "pnpm";
  if (tree.includes("yarn.lock")) return "yarn";
  if (tree.includes("bun.lockb")) return "bun";
  if (tree.includes("package-lock.json")) return "npm";
  if (tree.includes("requirements.txt")) return "pip";
  if (tree.includes("Pipfile.lock")) return "pipenv";
  if (tree.includes("poetry.lock")) return "poetry";
  return null;
}

function detectTestFramework(packageJson: string | null, tree: string[]): string | null {
  if (packageJson) {
    const j = packageJson.toLowerCase();
    if (j.includes('"vitest"')) return "Vitest";
    if (j.includes('"jest"')) return "Jest";
    if (j.includes('"mocha"')) return "Mocha";
    if (j.includes('"playwright"')) return "Playwright";
    if (j.includes('"cypress"')) return "Cypress";
  }
  if (tree.some((p) => /pytest\.ini|conftest\.py/.test(p))) return "pytest";
  return null;
}

export async function runRepoScanner(state: MissionState, owner: string, repo: string): Promise<Handoff<RepoContextPack>> {
  const meta = await getRepoMeta(owner, repo);
  const tree = await getTree(owner, repo, meta.defaultBranch);
  const treePaths = tree.map((t) => t.path);
  const allBlobs = tree.filter((t) => t.type === "blob").map((t) => t.path);

  const configFiles = detectConfigFiles(tree);
  const testFiles = detectTestFiles(tree);
  const ciFiles = detectCIFiles(tree);
  const readmePath = detectReadme(tree);
  const importantFiles = rankImportantFiles(tree, 6);

  const packageJsonPath = configFiles.find((p) => p.endsWith("package.json")) ?? null;
  const packageJson = packageJsonPath ? await getFile(owner, repo, packageJsonPath) : null;
  const readme = readmePath ? await getFile(owner, repo, readmePath) : null;

  const snippets: RepoContextPack["snippets"] = [];

  if (readme) {
    const truncated = readme.length > MAX_README_BYTES;
    const content = truncated ? readme.slice(0, MAX_README_BYTES) : readme;
    snippets.push({
      path: readmePath!,
      content,
      truncated,
      line_start: 1,
      line_end: content.split(/\r?\n/).length,
      snippet_hash: snippetHash(content),
    });
  }
  for (const p of [packageJsonPath, ...configFiles.filter((c) => c !== packageJsonPath)].filter(Boolean) as string[]) {
    const content = p === packageJsonPath ? packageJson : await getFile(owner, repo, p);
    if (content == null) continue;
    const truncated = content.length > MAX_SNIPPET_BYTES;
    const body = truncated ? content.slice(0, MAX_SNIPPET_BYTES) : content;
    snippets.push({
      path: p,
      content: body,
      truncated,
      line_start: 1,
      line_end: body.split(/\r?\n/).length,
      snippet_hash: snippetHash(body),
    });
  }
  for (const p of importantFiles) {
    const content = await getFile(owner, repo, p);
    if (content == null) continue;
    const truncated = content.length > MAX_SNIPPET_BYTES;
    const body = truncated ? content.slice(0, MAX_SNIPPET_BYTES) : content;
    snippets.push({
      path: p,
      content: body,
      truncated,
      line_start: 1,
      line_end: body.split(/\r?\n/).length,
      snippet_hash: snippetHash(body),
    });
  }
  for (const p of testFiles.slice(0, 2)) {
    const content = await getFile(owner, repo, p);
    if (content == null) continue;
    const truncated = content.length > MAX_SNIPPET_BYTES;
    const body = truncated ? content.slice(0, MAX_SNIPPET_BYTES) : content;
    snippets.push({
      path: p,
      content: body,
      truncated,
      line_start: 1,
      line_end: body.split(/\r?\n/).length,
      snippet_hash: snippetHash(body),
    });
  }

  const commits = await getCommits(owner, repo, 30);

  const framework = detectFramework(packageJson, treePaths);
  const packageManager = detectPackageManager(treePaths);
  const testFramework = detectTestFramework(packageJson, treePaths);

  const rawEstimate = estimateBytesTokens(meta.size * 1024);
  const packEstimate =
    snippets.reduce((s, x) => s + estimateTokens(x.content), 0) +
    estimateTokens(commits.map((c) => c.message).join("\n"));
  const intelligence = buildRepoIntelligenceIndex({
    files: tree.map((t) => ({ path: t.path, size: t.size, type: t.type })),
    snippets: snippets.map((s) => ({ path: s.path, content: s.content })),
  });

  const pack: RepoContextPack = {
    meta: {
      owner: meta.owner,
      repo: meta.name,
      defaultBranch: meta.defaultBranch,
      description: meta.description,
      primaryLanguage: meta.language,
      sizeKB: meta.size,
      stars: meta.stargazers,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      topics: meta.topics,
    },
    detected: {
      framework,
      packageManager,
      testFramework,
      hasCI: ciFiles.length > 0,
      hasDocker: treePaths.some((p) => /(^|\/)Dockerfile$/.test(p)),
      hasTypeScript: treePaths.some((p) => /\.tsx?$/.test(p)),
    },
    filesIndex: {
      total: allBlobs.length,
      all: allBlobs,
      important: importantFiles,
      config: configFiles,
      tests: testFiles,
      ci: ciFiles,
      readme: readmePath,
    },
    snippets,
    commits,
    tokens: { rawEstimate, packEstimate },
    intelligence,
  };

  state.context_pack = pack;

  return {
    agent: "repo-scanner",
    completed: [
      "repo_meta_fetched",
      "tree_indexed",
      "important_files_ranked",
      "deterministic_repo_intelligence_indexed",
      "context_pack_built",
    ],
    unresolved: [],
    evidence: [
      { reason: `Indexed ${pack.filesIndex.total} files; selected ${snippets.length} for analysis.` },
      { reason: `Repo intelligence: ${intelligence.routes.length} routes, ${intelligence.components.length} components, ${intelligence.functions.length} functions, ${intelligence.testFiles.length} test files.` },
      { reason: `Estimated raw repo size ~${rawEstimate.toLocaleString()} tokens; pack ~${packEstimate.toLocaleString()} tokens.` },
    ],
    issues_found:
      testFiles.length === 0 ? ["No test files detected in repo tree."] : [],
    next_recommended: "architecture",
    output: pack,
  };
}
