import { describe, expect, it } from "vitest";
import {
  EmployerSearchQuery,
  comparePayload,
  filterEmployerSummaries,
  summarizeEmployerProfile,
  type EmployerProfileBundle,
} from "./profiles";

function bundle(patch: Partial<EmployerProfileBundle> = {}): EmployerProfileBundle {
  return {
    id: "profile-1",
    slug: "candidate-one",
    visibility: "public",
    candidate: { name: "Candidate One", githubUsername: "candidate" },
    run: {
      id: "run-1",
      targetRole: "Frontend Developer",
      candidateLevel: "Junior",
      overallScore: 82,
      roleFit: "Strong Frontend Developer",
      verificationLevel: "repo_interview_verified",
      employerVerifier: JSON.stringify({
        biggest_risks: ["No major risk"],
        best_evidence: [{ file: "src/app.tsx", reason: "Concrete component evidence." }],
      }),
      authenticitySignals: JSON.stringify({ risk_signals: [] }),
      aiCollaboration: JSON.stringify({ overall_score: 76 }),
      ownershipStatus: JSON.stringify({ confidence: "verified" }),
      terminalEvidence: JSON.stringify([{ command: "npm test", exitCode: 0 }]),
      providerMatrix: null,
      executionMode: "api",
      repository: { repoUrl: "https://github.com/a/b", owner: "a", repoName: "b" },
      scores: [
        { skillName: "Testing", score: 74, scoreSource: "llm", confidence: 0.8, evidence: "[]" },
        { skillName: "Debugging", score: 80, scoreSource: "llm", confidence: 0.8, evidence: "[]" },
        { skillName: "Communication", score: 84, scoreSource: "llm", confidence: 0.8, evidence: "[]" },
        { skillName: "AI Collaboration", score: 76, scoreSource: "llm", confidence: 0.8, evidence: "[]" },
      ],
      questions: [{ answer: "Detailed answer", answerScore: 84 }],
    },
    ...patch,
  };
}

describe("employer profile search", () => {
  it("parses string booleans in search filters", () => {
    const parsed = EmployerSearchQuery.parse({
      interview_verified: "false",
      terminal_proof: "true",
    });
    expect(parsed.interview_verified).toBe(false);
    expect(parsed.terminal_proof).toBe(true);
  });

  it("filters by role, skill threshold, terminal proof, and interview status", () => {
    const strong = summarizeEmployerProfile(bundle());
    const weak = summarizeEmployerProfile(
      bundle({
        id: "profile-2",
        run: {
          ...bundle().run,
          targetRole: "Backend Developer",
          overallScore: 55,
          verificationLevel: "repo_only",
          terminalEvidence: "[]",
          questions: [],
          scores: [{ skillName: "Testing", score: 40, scoreSource: "llm", confidence: 0.8, evidence: "[]" }],
        },
      }),
    );

    const filtered = filterEmployerSummaries([strong, weak], {
      target_role: "frontend",
      skill: "Testing",
      skill_min: 70,
      terminal_proof: true,
      interview_verified: true,
      limit: 20,
    });

    expect(filtered.map((s) => s.id)).toEqual(["profile-1"]);
  });

  it("aggregates compare rows with hiring signals", () => {
    const rows = comparePayload([summarizeEmployerProfile(bundle())]);
    expect(rows[0]).toMatchObject({
      profile_id: "profile-1",
      candidate: "Candidate One",
      testing: 74,
      debugging: 80,
      communication: 84,
      ai_collab: 76,
      proof_strength: {
        ownership: "verified",
        interview_verified: true,
        terminal_proof: true,
        mock_or_heuristic: false,
      },
    });
  });
});
