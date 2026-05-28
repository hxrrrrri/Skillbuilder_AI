import { describe, expect, it } from "vitest";
import { getPublicProfilePublishBlockers } from "./profile-publish-gates";

function baseRun(overrides: Partial<Parameters<typeof getPublicProfilePublishBlockers>[0]> = {}) {
  return {
    status: "completed",
    executionMode: "api",
    providerMatrix: JSON.stringify({ orchestrator: "anthropic_api", worker: "anthropic_api", validator: "anthropic_api", interview: "anthropic_api", profile: "anthropic_api" }),
    validationSummary: JSON.stringify({ total: 1, passed: 1 }),
    profileSummary: JSON.stringify({ developer_summary: "Evidence-backed profile." }),
    employerVerifier: JSON.stringify({ hiring_recommendation: "Consider with reservations" }),
    ownershipStatus: JSON.stringify({ confidence: "verified", verification_method: "repo_token_verified" }),
    scores: [
      {
        skillName: "Testing",
        score: 80,
        scoreSource: "llm",
        evidence: JSON.stringify([{ file: "src/app/page.tsx", line_start: 1, reason: "Cited file evidence.", source: "github_api" }]),
      },
    ],
    ...overrides,
  };
}

describe("getPublicProfilePublishBlockers", () => {
  it("blocks incomplete runs", () => {
    const blockers = getPublicProfilePublishBlockers(baseRun({ status: "running" }));
    expect(blockers.map((b) => b.code)).toContain("run_incomplete");
  });

  it("blocks mock execution mode", () => {
    const blockers = getPublicProfilePublishBlockers(baseRun({ executionMode: "mock" }));
    expect(blockers.map((b) => b.code)).toContain("mock_execution_mode");
  });

  it("blocks mock and heuristic score sources", () => {
    const blockers = getPublicProfilePublishBlockers(baseRun({
      scores: [
        { skillName: "Architecture", score: 90, scoreSource: "heuristic", evidence: JSON.stringify([{ reason: "unsupported" }]) },
      ],
    }));
    expect(blockers.map((b) => b.code)).toContain("unsafe_score_source");
  });

  it("blocks measured scores without evidence", () => {
    const blockers = getPublicProfilePublishBlockers(baseRun({
      scores: [
        { skillName: "Testing", score: 80, scoreSource: "llm", evidence: JSON.stringify([]) },
      ],
    }));
    expect(blockers.map((b) => b.code)).toContain("missing_evidence");
  });

  it("blocks missing provider matrix and validation summary", () => {
    const blockers = getPublicProfilePublishBlockers(baseRun({ providerMatrix: null, validationSummary: null }));
    expect(blockers.map((b) => b.code)).toEqual(expect.arrayContaining(["provider_matrix_missing", "validation_summary_missing"]));
  });

  it("blocks public publishing when public-safe report artifacts are missing", () => {
    const blockers = getPublicProfilePublishBlockers(baseRun({
      profileSummary: null,
      employerVerifier: null,
      ownershipStatus: null,
    }));
    expect(blockers.map((b) => b.code)).toEqual(expect.arrayContaining([
      "profile_summary_missing",
      "employer_verifier_missing",
      "ownership_status_missing",
    ]));
  });
});
