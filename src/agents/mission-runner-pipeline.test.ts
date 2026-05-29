import { describe, expect, it } from "vitest";
import { PIPELINE } from "./mission-runner";

describe("mission runner pipeline", () => {
  it("matches the public verification lifecycle", () => {
    expect(PIPELINE).toEqual([
      "orchestrator",
      "repo-scanner",
      "architecture",
      "code-quality",
      "testing",
      "security",
      "ai-collaboration",
      "git-evidence",
      "documentation",
      "authenticity",
      "interview-gen",
      "validator",
      "skill-graph",
      "employer-verifier",
      "improvement-plan",
      "profile-gen",
    ]);
  });
});
