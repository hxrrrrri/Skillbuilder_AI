import { describe, expect, it } from "vitest";
import { encodeRepoPath } from "./github";

describe("encodeRepoPath", () => {
  it("preserves slashes", () => {
    expect(encodeRepoPath("src/app/page.tsx")).toBe("src/app/page.tsx");
  });
  it("encodes spaces inside segments", () => {
    expect(encodeRepoPath("src/my folder/file.ts")).toBe("src/my%20folder/file.ts");
  });
  it("encodes # inside segments", () => {
    expect(encodeRepoPath("docs/c#-guide.md")).toBe("docs/c%23-guide.md");
  });
  it("returns single segment intact when ASCII-safe", () => {
    expect(encodeRepoPath("README.md")).toBe("README.md");
  });
});
