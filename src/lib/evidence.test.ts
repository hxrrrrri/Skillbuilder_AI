import { describe, expect, it } from "vitest";
import { evidenceFromSnippet, extractLineRange, validateEvidenceAgainstContext } from "./evidence";
import type { RepoContextPack } from "@/agents/types";

const pack = {
  filesIndex: { all: ["src/a.ts"] },
  snippets: [{ path: "src/a.ts", content: "one\ntwo\nthree", truncated: false }],
} as RepoContextPack;

describe("evidence helpers", () => {
  it("extracts line ranges and hashes snippets", () => {
    const r = extractLineRange("a\nb\nc", 2, 3);
    expect(r.snippet).toBe("b\nc");
    expect(r.line_start).toBe(2);
    expect(r.snippet_hash).toHaveLength(64);
  });

  it("builds verifiable evidence from a file snippet", () => {
    const ev = evidenceFromSnippet({
      file: "src/a.ts",
      content: "one\ntwo\nthree",
      reason: "line evidence",
      line_start: 2,
      line_end: 2,
    });
    const [checked] = validateEvidenceAgainstContext([ev], pack);
    expect(checked.valid).toBe(true);
    expect(checked.validator_note).toMatch(/verified/i);
  });

  it("detects hash mismatch", () => {
    const [checked] = validateEvidenceAgainstContext([
      { file: "src/a.ts", line_start: 2, line_end: 2, reason: "bad", snippet_hash: "0".repeat(64) },
    ], pack);
    expect(checked.valid).toBe(false);
    expect(checked.validator_note).toMatch(/hash/i);
  });
});

