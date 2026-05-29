import { describe, expect, it } from "vitest";
import { applyAiChallengeScoreCaps, summarizeExecutionProof } from "./evaluation";

describe("AI collaboration challenge evaluation caps", () => {
  it("caps the score at 45 when a unified diff cannot be applied", () => {
    const capped = applyAiChallengeScoreCaps(
      {
        correctness_score: 90,
        explanation_quality_score: 88,
        test_awareness_score: 86,
        review_discipline_score: 84,
        ai_collaboration_maturity_score: 82,
        overall_score: 90,
        tool_used: "Codex",
        feedback: "Strong submission.",
      },
      {
        patchStatus: "failed",
        checks: [],
        reviewedAiOutput: true,
        limitationsDiscussed: true,
      },
    );

    expect(capped.overall_score).toBe(45);
    expect(capped.correctness_score).toBeLessThanOrEqual(45);
    expect(capped.feedback).toContain("Patch could not be applied");
  });

  it("caps executable-proof submissions when checks are unavailable or failing", () => {
    const unavailable = applyAiChallengeScoreCaps(
      {
        correctness_score: 95,
        explanation_quality_score: 95,
        test_awareness_score: 95,
        review_discipline_score: 95,
        ai_collaboration_maturity_score: 95,
        overall_score: 95,
        tool_used: "Claude Code",
        feedback: "Good.",
      },
      {
        patchStatus: "applied",
        checks: [],
        reviewedAiOutput: true,
        limitationsDiscussed: true,
      },
    );
    expect(unavailable.overall_score).toBe(70);

    const failing = applyAiChallengeScoreCaps(unavailable, {
      patchStatus: "applied",
      checks: [{ usedFor: "testing", exitCode: 1, command: "npm test" }],
      reviewedAiOutput: true,
      limitationsDiscussed: true,
    });
    expect(failing.overall_score).toBe(65);
  });

  it("caps review and maturity dimensions when review behavior is missing", () => {
    const capped = applyAiChallengeScoreCaps(
      {
        correctness_score: 80,
        explanation_quality_score: 80,
        test_awareness_score: 80,
        review_discipline_score: 80,
        ai_collaboration_maturity_score: 80,
        overall_score: 80,
        tool_used: "Cursor",
        feedback: "Good.",
      },
      {
        patchStatus: "applied",
        checks: [{ usedFor: "testing", exitCode: 0, command: "npm test" }],
        reviewedAiOutput: false,
        limitationsDiscussed: false,
      },
    );

    expect(capped.review_discipline_score).toBe(50);
    expect(capped.ai_collaboration_maturity_score).toBe(70);
    expect(capped.overall_score).toBeLessThanOrEqual(70);
  });
});

describe("AI challenge execution proof summary", () => {
  it("states what remains unverified when no checks ran", () => {
    const proof = summarizeExecutionProof({ patchStatus: "applied", checks: [] });

    expect(proof.whatThisProves).toContain("Submitted diff can be applied to the candidate repository.");
    expect(proof.remainingUnverified).toContain("No executable tests, typecheck, lint, or build command was available.");
  });
});
