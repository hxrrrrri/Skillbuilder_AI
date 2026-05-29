// Lightweight, deterministic project-knowledge layer for the copilot.
//
// No embeddings, no external services: we read a fixed set of project docs,
// split them into heading-anchored chunks, and rank chunks against the user's
// message with a transparent keyword-overlap score. The top snippets are handed
// to the assistant as *untrusted reference context* (see policy.ts) and surfaced
// to the user as citations. Retrieved text is treated as data, never as
// instructions, and is scrubbed by redaction before display.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type KnowledgeSourceType = "docs" | "route" | "schema" | "provider" | "admin_help";

export type KnowledgeDoc = {
  title: string;
  path: string; // repo-relative
  sourceType: KnowledgeSourceType;
};

export type KnowledgeChunk = {
  title: string;
  path: string;
  sourceType: KnowledgeSourceType;
  heading: string;
  text: string;
};

export type KnowledgeHit = KnowledgeChunk & { score: number };

// The curated doc set. Missing files are skipped silently so the indexer is safe
// across branches where a doc may not exist yet.
export const KNOWLEDGE_DOCS: KnowledgeDoc[] = [
  { title: "README", path: "README.md", sourceType: "docs" },
  { title: "Architecture", path: "docs/ARCHITECTURE.md", sourceType: "docs" },
  { title: "Trust model", path: "docs/TRUST_MODEL.md", sourceType: "docs" },
  { title: "Security model", path: "docs/SECURITY_MODEL.md", sourceType: "docs" },
  { title: "Security", path: "docs/SECURITY.md", sourceType: "docs" },
  { title: "Provider setup", path: "docs/PROVIDER_SETUP.md", sourceType: "provider" },
  { title: "Judge walkthrough", path: "docs/JUDGE_WALKTHROUGH.md", sourceType: "docs" },
  { title: "Demo script", path: "docs/DEMO_SCRIPT.md", sourceType: "docs" },
  { title: "Hackathon demo script", path: "docs/HACKATHON_DEMO_SCRIPT.md", sourceType: "docs" },
  { title: "Command Copilot", path: "docs/COMMAND_COPILOT.md", sourceType: "docs" },
];

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "be",
  "how", "do", "i", "my", "me", "with", "this", "that", "it", "can", "what", "use",
  "using", "get", "got", "have", "has", "as", "at", "by", "from", "you", "your",
]);

export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/** Split a markdown document into heading-anchored chunks. Pure. */
export function chunkMarkdown(doc: KnowledgeDoc, content: string): KnowledgeChunk[] {
  const lines = content.split(/\r?\n/);
  const chunks: KnowledgeChunk[] = [];
  let heading = doc.title;
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) {
      chunks.push({ title: doc.title, path: doc.path, sourceType: doc.sourceType, heading, text });
    }
    buffer = [];
  };

  for (const line of lines) {
    const m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      heading = m[2].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
}

/** Transparent keyword-overlap score between a query and a chunk. Pure. */
export function scoreChunk(queryTokens: string[], chunk: KnowledgeChunk): number {
  if (queryTokens.length === 0) return 0;
  const headingTokens = new Set(tokenize(chunk.heading));
  const bodyTokens = tokenize(chunk.text);
  const bodyCounts = new Map<string, number>();
  for (const t of bodyTokens) bodyCounts.set(t, (bodyCounts.get(t) ?? 0) + 1);

  let score = 0;
  const seen = new Set<string>();
  for (const q of queryTokens) {
    if (seen.has(q)) continue;
    seen.add(q);
    if (headingTokens.has(q)) score += 3; // heading match is a strong signal
    const count = bodyCounts.get(q) ?? 0;
    if (count > 0) score += 1 + Math.min(count, 3) * 0.5;
  }
  // Normalize lightly so very long chunks don't dominate purely by length.
  return score / (1 + Math.log10(1 + bodyTokens.length));
}

export function rankChunks(query: string, chunks: KnowledgeChunk[], limit = 4): KnowledgeHit[] {
  const queryTokens = tokenize(query);
  return chunks
    .map((chunk) => ({ ...chunk, score: scoreChunk(queryTokens, chunk) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// --------------- Filesystem-backed loading (impure) ---------------

let cachedChunks: KnowledgeChunk[] | null = null;

export function loadKnowledgeChunks(root = process.cwd()): KnowledgeChunk[] {
  if (cachedChunks) return cachedChunks;
  const chunks: KnowledgeChunk[] = [];
  for (const doc of KNOWLEDGE_DOCS) {
    try {
      const full = path.join(root, doc.path);
      const content = fs.readFileSync(full, "utf8");
      chunks.push(...chunkMarkdown(doc, content));
    } catch {
      // Missing/unreadable doc — skip.
    }
  }
  cachedChunks = chunks;
  return chunks;
}

export function invalidateKnowledgeCache(): void {
  cachedChunks = null;
}

export function searchKnowledge(query: string, limit = 4, root = process.cwd()): KnowledgeHit[] {
  return rankChunks(query, loadKnowledgeChunks(root), limit);
}

/**
 * Refresh ChatKnowledgeSource rows with current content hashes. Best-effort: the
 * copilot reads from the filesystem at request time, so this is bookkeeping for
 * the admin "knowledge" view and re-index detection, not a hard dependency.
 */
export async function indexKnowledgeSources(
  prisma: { chatKnowledgeSource: { upsert: (args: any) => Promise<unknown> } },
  root = process.cwd(),
): Promise<{ indexed: number }> {
  let indexed = 0;
  for (const doc of KNOWLEDGE_DOCS) {
    try {
      const content = fs.readFileSync(path.join(root, doc.path), "utf8");
      const contentHash = hashContent(content);
      await prisma.chatKnowledgeSource.upsert({
        where: { path: doc.path },
        update: { title: doc.title, sourceType: doc.sourceType, contentHash, lastIndexedAt: new Date() },
        create: { title: doc.title, sourceType: doc.sourceType, path: doc.path, contentHash },
      });
      indexed++;
    } catch {
      // skip missing
    }
  }
  return { indexed };
}
