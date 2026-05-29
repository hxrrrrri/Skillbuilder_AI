import { describe, expect, it } from "vitest";
import { chunkMarkdown, rankChunks, tokenize, hashContent, type KnowledgeDoc } from "./knowledge";

const doc: KnowledgeDoc = { title: "Test", path: "docs/TEST.md", sourceType: "docs" };

const MD = `# Ownership proof
You prove repository ownership with an ownership challenge token.

# Scores and not_measured
Anything that cannot be evidenced is reported as not_measured instead of guessed.

# Publishing
Publish an employer-safe public profile after verification completes.
`;

describe("knowledge index (deterministic search)", () => {
  it("chunks markdown by heading", () => {
    const chunks = chunkMarkdown(doc, MD);
    expect(chunks.length).toBe(3);
    expect(chunks.map((c) => c.heading)).toEqual(["Ownership proof", "Scores and not_measured", "Publishing"]);
  });

  it("ranks the most relevant chunk first", () => {
    const chunks = chunkMarkdown(doc, MD);
    const hits = rankChunks("how do I prove ownership of my repo", chunks, 3);
    expect(hits[0].heading).toBe("Ownership proof");
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it("matches not_measured queries", () => {
    const chunks = chunkMarkdown(doc, MD);
    const hits = rankChunks("what does not_measured mean", chunks, 3);
    expect(hits[0].heading).toBe("Scores and not_measured");
  });

  it("tokenize drops stop words and punctuation", () => {
    expect(tokenize("How do I publish?")).toEqual(["publish"]);
  });

  it("hashContent is stable", () => {
    expect(hashContent("abc")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
  });
});
