// Development-only fixture seed endpoint. Disabled unless explicitly enabled.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_OWNER = "skillproof";
const DEMO_REPO = "demo-orderbook";
const DEMO_REPO_URL = "https://github.com/skillproof/demo-orderbook";

function demoTerminalEvidence() {
  return [
    {
      command: "git clone --depth 50 --single-branch https://github.com/skillproof/demo-orderbook",
      cwd: ".skillproof/runs/demo",
      exitCode: 0,
      stdoutSummary: "Cloning into 'demo-orderbook'...\nremote: Total 87 (delta 12), reused 0 (delta 0)",
      stderrSummary: "",
      durationMs: 2300,
      usedFor: "git",
    },
    {
      command: "git log --oneline -n 30",
      cwd: ".skillproof/runs/demo/demo-orderbook",
      exitCode: 0,
      stdoutSummary: "a1b2c3d feat: add limit-order matching\n9e8f7d6 test: cover order cancellation\n5c4b3a2 chore: tighten ESLint\n2d1e0f9 refactor: extract price-level book",
      stderrSummary: "",
      durationMs: 80,
      usedFor: "git",
    },
    {
      command: "pnpm run test",
      cwd: ".skillproof/runs/demo/demo-orderbook",
      exitCode: 0,
      stdoutSummary: "✓ src/orderbook.test.ts (12)\n✓ src/match.test.ts (7)\n\nTest Files  2 passed (2)\nTests       19 passed (19)",
      stderrSummary: "",
      durationMs: 4200,
      usedFor: "testing",
    },
    {
      command: "pnpm run build",
      cwd: ".skillproof/runs/demo/demo-orderbook",
      exitCode: 0,
      stdoutSummary: "tsc --build\nDone in 1.2s",
      stderrSummary: "",
      durationMs: 1500,
      usedFor: "build",
    },
    {
      command: "pnpm run typecheck",
      cwd: ".skillproof/runs/demo/demo-orderbook",
      exitCode: 0,
      stdoutSummary: "no errors",
      stderrSummary: "",
      durationMs: 1100,
      usedFor: "typecheck",
    },
    {
      command: "gh api user -q .login",
      cwd: ".skillproof/runs/demo/demo-orderbook",
      exitCode: 0,
      stdoutSummary: "skillproof",
      stderrSummary: "",
      durationMs: 320,
      usedFor: "ownership",
    },
  ];
}

const providerMatrix = {
  orchestrator: "claude_cli",
  worker: "ollama",
  validator: "anthropic_api",
  interview: "claude_cli",
  profile: "anthropic_api",
};

const ownershipStatus = {
  owner_match: true,
  repo_token_verified: false,
  self_declared: false,
  gh_user: "skillproof",
  github_username: "skillproof",
  repo_owner: DEMO_OWNER,
  confidence: "verified",
  notes: ["gh authenticated user matches repo owner 'skillproof'."],
};

const validationContract = {
  mission_id: "sp_demo0001",
  target_role: "Junior Backend Engineer",
  candidate_level: "Junior",
  evaluation_dimensions: ["architecture", "code_quality", "testing", "security", "git_workflow", "documentation"],
  assertions: [
    { id: "A1", dimension: "testing", statement: "Repo contains automated tests for at least one critical path.", weight: 10 },
    { id: "A2", dimension: "git_workflow", statement: "Commits use meaningful messages.", weight: 7 },
    { id: "A3", dimension: "architecture", statement: "Project separates UI, data, and business logic.", weight: 8 },
  ],
  rubric: {
    architecture: { weight: 15, passingScore: 60 },
    code_quality: { weight: 15, passingScore: 60 },
    testing: { weight: 15, passingScore: 55 },
    security: { weight: 10, passingScore: 60 },
    git_workflow: { weight: 10, passingScore: 55 },
    documentation: { weight: 10, passingScore: 55 },
  },
};

const validationCoverage = [
  { assertion_id: "A1", dimension: "testing", status: "passed", evidence: [{ reason: "19/19 tests pass locally" }], responsible_agent: "testing", notes: "Local tests passed" },
  { assertion_id: "A2", dimension: "git_workflow", status: "passed", evidence: [{ reason: "conventional commit messages" }], responsible_agent: "git-evidence", notes: "Good hygiene" },
  { assertion_id: "A3", dimension: "architecture", status: "partial", evidence: [{ reason: "src/ separated; minor mixing" }], responsible_agent: "architecture", notes: "Mostly clean" },
];

const skillScores = [
  { skill: "Architecture", score: 72, src: "llm", evidence: [{ file: "src/orderbook.ts", reason: "Clear separation between book and match engine." }] },
  { skill: "Code Quality", score: 75, src: "llm", evidence: [{ file: "src/match.ts", reason: "Functions are small and named for intent." }, { reason: "terminal · build OK · `pnpm run build` exit=0" }] },
  { skill: "Testing", score: 82, src: "llm", evidence: [{ file: "src/orderbook.test.ts", reason: "12 scenarios incl. partial fills" }, { reason: "terminal · tests PASSED · `pnpm run test` exit=0 (4200ms)" }] },
  { skill: "Security", score: 65, src: "heuristic", evidence: [{ reason: "No obvious secret patterns in snippets." }] },
  { skill: "Git Workflow", score: 78, src: "llm", evidence: [{ reason: "Conventional commits used consistently." }, { reason: "terminal · git · `git log` exit=0" }] },
  { skill: "Documentation", score: 70, src: "llm", evidence: [{ file: "README.md", reason: "Setup + Architecture sections present." }] },
  { skill: "Debugging", score: 68, src: "llm", evidence: [{ reason: "Demo interview answer scored well on debugging." }] },
  { skill: "Communication", score: 74, src: "llm", evidence: [{ reason: "Demo interview answer." }] },
  { skill: "AI Collaboration", score: 71, src: "llm", evidence: [{ reason: "Demo collab challenge submission." }] },
  { skill: "Authenticity", score: 80, src: "heuristic", evidence: [{ reason: "Sustained commits + descriptive messages." }] },
];

const authenticitySignals = {
  authenticity_score: 80,
  confidence: 0.75,
  positive_signals: ["Sustained commit history (24 sampled)", "Most commit messages are descriptive."],
  risk_signals: [],
  evidence: [{ reason: "Heuristic over 24 commits + repo meta." }],
  score_source: "heuristic",
};

const improvementPlan = {
  seven_day: [
    "Add an integration test that walks a full match cycle end-to-end.",
    "Document the order-cancel race condition in README.",
  ],
  thirty_day: [
    { week: 1, title: "End-to-end test", detail: "Cover order placement → match → cancel.", files: ["src/orderbook.ts", "src/match.ts"] },
    { week: 2, title: "CI matrix", detail: "Run tests on Node 18/20." },
    { week: 3, title: "Refactor price levels", detail: "Extract per-price level into its own module." },
    { week: 4, title: "Latency benchmarks", detail: "Add k6 or autocannon benchmark for hot path." },
  ],
  recommended_tests: ["Add tests for src/match.ts edge cases."],
  git_hygiene: ["Continue conventional commits.", "Avoid mixing refactor + feature in same commit."],
};

const employerVerifier = {
  hiring_recommendation: "Strong shortlist",
  confidence: 0.83,
  top_verified_skills: ["Testing", "Git Workflow", "Code Quality"],
  biggest_risks: ["No e2e tests yet — happy path only."],
  best_evidence: [
    { reason: "Local tests passed: `pnpm run test` (19/19)" },
    { reason: "Local build succeeded: `pnpm run build`" },
    { reason: "Ownership verified (gh user match)." },
    { file: "src/orderbook.test.ts", reason: "12 scenarios incl. partial fills" },
  ],
  terminal_proof_summary: "git: 2P/0F · testing: 1P/0F · build: 1P/0F · typecheck: 1P/0F · ownership: 1P/0F",
  suggested_followup_questions: [
    "Walk through the price-level data structure choice.",
    "How would you test the cancel-during-match race?",
  ],
  role_fit_summary: "Strong shortlist for Junior Backend Engineer at Junior level.",
  shortlist_reason: "Overall 74/100, ownership verified, terminal evidence captured.",
  caution_reason: null,
  ownership_status: ownershipStatus,
  execution_mode: "cli",
  verification_level: "repo_only",
};

const profileSummary = {
  developer_summary: "Junior Backend Engineer with an overall SkillProof score of 74/100. Strongest in Testing and Git Workflow, supported by local terminal evidence.",
  verified_skills: ["Testing", "Git Workflow", "Code Quality"],
  improvement_areas: ["Documentation depth", "End-to-end tests"],
  employer_recommendation: "Strong shortlist. Verify race-condition reasoning in follow-up.",
  evidence_highlights: [
    { file: "src/orderbook.test.ts", reason: "12 scenarios incl. partial fills" },
    { reason: "Local tests passed via pnpm run test" },
  ],
  employer_verifier: employerVerifier,
  improvement_plan: improvementPlan,
};

const interviewQuestions = [
  { question: "Walk me through how src/match.ts handles partial fills.", source_file: "src/match.ts", expected_signals: ["data structure reasoning", "edge case awareness"], answer: "I keep open quantity on the resting order and only remove it from the level when it hits zero. Partial fills emit a trade event per match step.", answerScore: 72, feedback: "Clear and correct; could deepen on cancel race." },
];

export async function GET() {
  if (process.env.NODE_ENV === "production" || process.env.SKILLPROOF_ENABLE_FIXTURE_DATA !== "1") {
    return NextResponse.json(
      {
        error: "fixture_seed_disabled",
        reason: "Fixture data is development-only. Set SKILLPROOF_ENABLE_FIXTURE_DATA=1 outside production to enable.",
      },
      { status: 404 },
    );
  }
  // Idempotent: clean previous demo records by candidate name.
  const existing = await prisma.publicProfile.findFirst({ where: { slug: "demo" } });
  if (existing) {
    await prisma.publicProfile.delete({ where: { id: existing.id } });
  }

  const candidate = await prisma.candidate.create({
    data: { name: "SkillProof Demo Candidate", githubUsername: "skillproof" },
  });
  const repository = await prisma.repository.create({
    data: {
      candidateId: candidate.id,
      repoUrl: DEMO_REPO_URL,
      repoName: DEMO_REPO,
      owner: DEMO_OWNER,
      primaryLanguage: "TypeScript",
      framework: "Node",
    },
  });
  const run = await prisma.analysisRun.create({
    data: {
      candidateId: candidate.id,
      repoId: repository.id,
      targetRole: "Junior Backend Engineer",
      candidateLevel: "Junior",
      status: "completed",
      statusMessage: "Demo seed",
      overallScore: 74,
      roleFit: "Junior Backend Engineer",
      verificationLevel: "repo_interview_verified",
      tokenEstimateRaw: 32000,
      tokenEstimateUsed: 4800,
      validationContract: JSON.stringify(validationContract),
      validationCoverage: JSON.stringify(validationCoverage),
      authenticitySignals: JSON.stringify(authenticitySignals),
      improvementPlan: JSON.stringify(improvementPlan),
      employerVerifier: JSON.stringify(employerVerifier),
      profileSummary: JSON.stringify(profileSummary),
      aiCollaboration: JSON.stringify({
        correctness_score: 70,
        explanation_quality_score: 75,
        test_awareness_score: 78,
        review_discipline_score: 70,
        ai_collaboration_maturity_score: 72,
        overall_score: 71,
        tool_used: "Claude Code",
        feedback: "Demo collaboration submission — solid review discipline.",
      }),
      executionMode: "cli",
      providerMatrix: JSON.stringify(providerMatrix),
      terminalEvidence: JSON.stringify(demoTerminalEvidence()),
      ownershipStatus: JSON.stringify(ownershipStatus),
      completedAt: new Date(),
    },
  });

  await prisma.skillScore.createMany({
    data: skillScores.map((s) => ({
      runId: run.id,
      skillName: s.skill,
      score: s.score,
      confidence: 0.82,
      scoreSource: s.src,
      evidence: JSON.stringify(s.evidence),
    })),
  });

  await prisma.interviewQuestion.createMany({
    data: interviewQuestions.map((q) => ({
      runId: run.id,
      question: q.question,
      sourceFile: q.source_file,
      expectedSignals: JSON.stringify(q.expected_signals),
      answer: q.answer,
      answerScore: q.answerScore,
      feedback: q.feedback,
      dimensionScores: JSON.stringify({
        communication: 75,
        debugging: 70,
        architecture_explanation: 72,
        testing_reasoning: 76,
        understanding_of_own_code: 78,
      }),
    })),
  });

  const slug = slugify("demo");
  const profile = await prisma.publicProfile.create({
    data: { candidateId: candidate.id, runId: run.id, slug },
  });

  return NextResponse.json({
    ok: true,
    demo: true,
    candidate_id: candidate.id,
    run_id: run.id,
    profile_url: `/profile/${profile.slug}`,
    mission_url: `/mission/${run.id}`,
  });
}
