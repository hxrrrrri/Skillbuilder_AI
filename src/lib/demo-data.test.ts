import { describe, expect, it } from "vitest";
import {
  DEMO_PROFILE_SLUG,
  buildDemoRunArtifacts,
  buildDemoSkillScores,
  measuredDemoScores,
} from "./demo-data";
import { getPublicProfilePublishBlockers } from "./profile-publish-gates";

describe("demo seed data", () => {
  it("keeps seeded demo scores private and never public-publishable as verification", () => {
    const scores = buildDemoSkillScores();
    const measured = measuredDemoScores(scores);

    expect(scores.some((score) => score.scoreSource === "not_measured")).toBe(true);
    expect(measured.length).toBeGreaterThan(6);
    expect(measured.every((score) => score.scoreSource !== "mock" && score.scoreSource !== "heuristic")).toBe(true);
    expect(measured.every((score) => score.validatorNotes && score.validatorNotes.length > 12)).toBe(true);
    expect(measured.every((score) => JSON.parse(score.evidence).length > 0)).toBe(true);
    expect(measured.every((score) => /demo/i.test(score.validatorNotes))).toBe(true);
  });

  it("blocks completed seeded demo profiles from public publish gates", () => {
    const artifacts = buildDemoRunArtifacts();
    const blockers = getPublicProfilePublishBlockers({
      status: "completed",
      executionMode: "hybrid",
      providerMatrix: artifacts.providerMatrix,
      validationSummary: artifacts.validationSummary,
      profileSummary: artifacts.profileSummary,
      employerVerifier: artifacts.employerVerifier,
      ownershipStatus: artifacts.ownershipStatus,
      scores: buildDemoSkillScores(),
    });

    expect(DEMO_PROFILE_SLUG).toBe("casey-candidate-skillproof-ai-demo");
    expect(blockers.map((b) => b.code)).toContain("seeded_demo_profile");
  });
});
