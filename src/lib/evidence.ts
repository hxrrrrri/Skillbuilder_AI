import crypto from "node:crypto";
import type { Evidence, RepoContextPack } from "@/agents/types";

export function snippetHash(snippet: string): string {
  return crypto.createHash("sha256").update(snippet, "utf8").digest("hex");
}

export function lineCount(text: string): number {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

export function extractLineRange(content: string, start = 1, end = start): {
  line_start: number;
  line_end: number;
  snippet: string;
  snippet_hash: string;
} {
  const lines = content.split(/\r?\n/);
  const safeStart = Math.max(1, Math.min(start, lines.length || 1));
  const safeEnd = Math.max(safeStart, Math.min(end, lines.length || safeStart));
  const snippet = lines.slice(safeStart - 1, safeEnd).join("\n");
  return {
    line_start: safeStart,
    line_end: safeEnd,
    snippet,
    snippet_hash: snippetHash(snippet),
  };
}

export function evidenceFromSnippet(args: {
  file: string;
  content: string;
  reason: string;
  line_start?: number;
  line_end?: number;
  source?: Evidence["source"];
  confidence?: number;
}): Evidence {
  const line_start = args.line_start ?? 1;
  const line_end = args.line_end ?? Math.min(line_start + 4, lineCount(args.content) || line_start);
  return {
    file: args.file,
    reason: args.reason,
    source: args.source ?? "github_api",
    confidence: args.confidence,
    ...extractLineRange(args.content, line_start, line_end),
  };
}

export function hydrateEvidenceFromContext(
  evidence: Evidence[],
  pack: RepoContextPack | null,
  source: Evidence["source"],
): Evidence[] {
  if (!pack) {
    return evidence.map((e) => ({ ...e, source: e.source ?? source }));
  }
  const byPath = new Map(pack.snippets.map((s) => [s.path, s.content]));
  return evidence.map((e) => {
    const file = e.file;
    const out: Evidence = { ...e, source: e.source ?? source };
    if (out.line && !out.line_start) {
      out.line_start = out.line;
      out.line_end = out.line;
    }
    if (!file || out.snippet_hash) return out;
    const content = byPath.get(file);
    if (!content) return out;
    const start = out.line_start ?? out.line ?? 1;
    const end = out.line_end ?? Math.min(start + 4, lineCount(content));
    return { ...out, ...extractLineRange(content, start, end) };
  });
}

export function validateEvidenceAgainstContext(
  evidence: Evidence[],
  pack: RepoContextPack | null,
): Array<Evidence & { valid: boolean; validator_note?: string }> {
  const truth = new Set(pack?.filesIndex.all ?? []);
  const snippets = new Map(pack?.snippets.map((s) => [s.path, s.content]) ?? []);
  return evidence.map((e) => {
    if (!e.file) {
      const direct = e.source === "terminal" || e.source === "interview" || e.source === "challenge";
      return {
        ...e,
        valid: direct,
        validator_note: direct ? "Non-file evidence accepted by source type." : "No file reference.",
      };
    }
    if (!truth.has(e.file)) {
      return { ...e, valid: false, validator_note: "File not present in repository tree." };
    }
    const content = snippets.get(e.file);
    if (!content) {
      return { ...e, valid: true, validator_note: "File exists; snippet content not available for hash check." };
    }
    const lines = lineCount(content);
    const start = e.line_start ?? e.line ?? 1;
    const end = e.line_end ?? start;
    if (start < 1 || end < start || end > lines) {
      return { ...e, valid: false, validator_note: `Line range ${start}-${end} outside available content (${lines} lines).` };
    }
    if (e.snippet_hash) {
      const actual = extractLineRange(content, start, end).snippet_hash;
      if (actual !== e.snippet_hash) {
        return { ...e, valid: false, validator_note: "Snippet hash mismatch." };
      }
    }
    return { ...e, valid: true, validator_note: "File and line evidence verified." };
  });
}

