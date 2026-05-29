export const DEMO_PROFILE_SLUG = "casey-candidate-skillproof-ai-demo";
export const DEMO_COHORT_NAME = "SkillProof AI Judge Demo Cohort";
export const DEMO_SHORTLIST_NAME = "Hackathon judge shortlist";
export const DEMO_REPO = {
  owner: "casey-candidate",
  name: "skillproof-commerce",
  url: "https://github.com/casey-candidate/skillproof-commerce",
};

type DemoScoreSource =
  | "llm"
  | "terminal"
  | "github_api"
  | "local_clone"
  | "interview"
  | "challenge"
  | "deterministic"
  | "not_measured"
  | "mock"
  | "heuristic";

export type DemoScoreSeed = {
  skillName: string;
  score: number;
  confidence: number;
  scoreSource: DemoScoreSource;
  evidence: string;
  validatorNotes: string;
};

type DemoEvidenceInput = {
  file?: string;
  line_start?: number;
  line_end?: number;
  reason: string;
  source: Exclude<DemoScoreSource, "not_measured" | "mock" | "heuristic">;
  confidence?: number;
  validator_note?: string;
  command_run_id?: string;
};

function json(value: unknown) {
  return JSON.stringify(value);
}

function evidence(input: DemoEvidenceInput) {
  return {
    file: input.file,
    line_start: input.line_start,
    line_end: input.line_end,
    reason: input.reason,
    source: input.source,
    confidence: input.confidence ?? 0.86,
    validator_note:
      input.validator_note ??
      "Seeded demo evidence is public-safe and marked as demo data; live runs must regenerate this from the submitted repository.",
    command_run_id: input.command_run_id,
  };
}

function score(
  skillName: string,
  scoreValue: number,
  scoreSource: DemoScoreSource,
  evidenceItems: ReturnType<typeof evidence>[],
  validatorNotes: string,
  confidence = 0.86,
): DemoScoreSeed {
  return {
    skillName,
    score: scoreValue,
    confidence,
    scoreSource,
    evidence: json(evidenceItems),
    validatorNotes: /demo/i.test(validatorNotes) ? validatorNotes : `${validatorNotes} Seeded demo data is private walkthrough material and not live verification.`,
  };
}

export function buildDemoSkillScores(options: { terminalCommandRunIds?: Record<string, string> } = {}): DemoScoreSeed[] {
  const terminalIds = options.terminalCommandRunIds ?? {};
  return [
    score(
      "Architecture",
      86,
      "llm",
      [
        evidence({
          file: "src/app/api/orders/route.ts",
          line_start: 18,
          line_end: 76,
          reason: "Route handler delegates validation, persistence, and event emission instead of mixing all logic inline.",
          source: "llm",
        }),
        evidence({
          file: "src/lib/orders/service.ts",
          line_start: 9,
          line_end: 64,
          reason: "Order workflow is isolated in a service module with explicit inputs and typed results.",
          source: "local_clone",
        }),
      ],
      "Validator accepted two file-backed architecture claims and capped the score below exceptional because deployment evidence is limited.",
      0.88,
    ),
    score(
      "Code Quality",
      82,
      "llm",
      [
        evidence({
          file: "src/lib/cart/reducer.ts",
          line_start: 11,
          line_end: 58,
          reason: "State transitions are small, named, and covered by reducer tests.",
          source: "llm",
        }),
        evidence({
          file: "src/components/checkout/CheckoutForm.tsx",
          line_start: 31,
          line_end: 124,
          reason: "Form state is separated from payment submission and validation display.",
          source: "local_clone",
        }),
      ],
      "Validator found evidence for maintainability but reduced confidence because only selected files were reviewed in the demo seed.",
      0.84,
    ),
    score(
      "Testing",
      78,
      "terminal",
      [
        evidence({
          file: "src/lib/cart/reducer.test.ts",
          line_start: 6,
          line_end: 42,
          reason: "Reducer tests cover add, remove, quantity update, and empty-cart behavior.",
          source: "terminal",
          command_run_id: terminalIds.test,
        }),
        evidence({
          file: ".github/workflows/ci.yml",
          line_start: 12,
          line_end: 24,
          reason: "CI runs typecheck and tests on pull requests.",
          source: "github_api",
        }),
      ],
      "Terminal proof passed for npm test. Score is not higher because no browser end-to-end run was provided.",
      0.82,
    ),
    score(
      "Security",
      74,
      "llm",
      [
        evidence({
          file: "src/app/api/orders/route.ts",
          line_start: 22,
          line_end: 38,
          reason: "Request body is validated before crossing the order creation boundary.",
          source: "llm",
        }),
        evidence({
          file: ".env.example",
          line_start: 1,
          line_end: 8,
          reason: "Configuration template names required values without exposing real secrets.",
          source: "local_clone",
        }),
      ],
      "Validator found no public-safe secret evidence but kept the score moderate because dependency audit output was not included.",
      0.79,
    ),
    score(
      "Git Workflow",
      81,
      "github_api",
      [
        evidence({
          file: "git:commit-history",
          reason: "Recent commits are incremental and map to checkout, validation, and test work.",
          source: "github_api",
        }),
      ],
      "Commit evidence is from the seeded demo summary. Live runs must refresh this from GitHub or local clone history.",
      0.8,
    ),
    score(
      "Documentation",
      76,
      "llm",
      [
        evidence({
          file: "README.md",
          line_start: 1,
          line_end: 58,
          reason: "README explains setup, environment configuration, test commands, and deployment shape.",
          source: "llm",
        }),
      ],
      "Documentation is specific enough for onboarding. Score is capped because operational runbooks are missing.",
      0.78,
    ),
    score(
      "Debugging",
      84,
      "interview",
      [
        evidence({
          file: "src/lib/orders/service.ts",
          line_start: 41,
          line_end: 64,
          reason: "Candidate explained how failed payment state is isolated and retried without double-creating orders.",
          source: "interview",
        }),
      ],
      "Own-code answer connected a failure mode to concrete code paths and tests.",
      0.85,
    ),
    score(
      "Communication",
      88,
      "interview",
      [
        evidence({
          file: "src/components/checkout/CheckoutForm.tsx",
          line_start: 31,
          line_end: 124,
          reason: "Candidate clearly explained component boundaries, validation feedback, and tradeoffs without exposing private answer text.",
          source: "interview",
        }),
      ],
      "Interview evaluator scored high clarity across architecture and testing explanations.",
      0.87,
    ),
    score(
      "AI Collaboration",
      83,
      "challenge",
      [
        evidence({
          file: "src/lib/cart/reducer.ts",
          line_start: 11,
          line_end: 58,
          reason: "Challenge response proposed an AI-assisted reducer refactor, named hallucination checks, and required tests before merge.",
          source: "challenge",
        }),
      ],
      "Challenge evidence shows responsible AI usage with review discipline and test awareness.",
      0.84,
    ),
    score(
      "Terminal Proof",
      80,
      "terminal",
      [
        evidence({
          reason: "npm run typecheck, npm test, and npm run build passed in a policy-gated proof workspace.",
          source: "terminal",
          command_run_id: terminalIds.build,
        }),
      ],
      "Terminal commands are allowlisted and redacted. Public profile includes summaries and hashes only.",
      0.82,
    ),
    {
      skillName: "Production Incident Handling",
      score: -1,
      confidence: 0,
      scoreSource: "not_measured",
      evidence: "[]",
      validatorNotes: "No production incident or pager evidence was supplied; this dimension is excluded from the score.",
    },
  ];
}

export function measuredDemoScores(scores = buildDemoSkillScores()) {
  return scores.filter((scoreItem) => scoreItem.score >= 0 && scoreItem.scoreSource !== "not_measured");
}

export function buildDemoRunArtifacts() {
  const validationContract = {
    mission_id: "demo-skillproof-commerce",
    target_role: "Full-stack Developer",
    candidate_level: "Junior",
    evaluation_dimensions: [
      "architecture",
      "code_quality",
      "testing",
      "security",
      "git_workflow",
      "documentation",
      "debugging",
      "ai_collaboration",
      "communication",
    ],
    assertions: [
      { id: "A1", dimension: "architecture", statement: "Project separates UI, API, and business logic.", weight: 10, detector: "static", required_evidence: 2 },
      { id: "A2", dimension: "testing", statement: "Automated tests exercise the cart and checkout paths.", weight: 12, detector: "terminal", required_evidence: 2 },
      { id: "A3", dimension: "security", statement: "Incoming order data is validated before persistence.", weight: 8, detector: "static", required_evidence: 1 },
      { id: "A4", dimension: "ai_collaboration", statement: "Candidate can use AI as a reviewed draft rather than trusted output.", weight: 6, detector: "challenge", required_evidence: 1 },
      { id: "A5", dimension: "communication", statement: "Candidate explains own code with file references and tradeoffs.", weight: 8, detector: "interview", required_evidence: 1 },
    ],
    rubric: {
      architecture: { weight: 15, passingScore: 60 },
      code_quality: { weight: 15, passingScore: 60 },
      testing: { weight: 15, passingScore: 55 },
      security: { weight: 10, passingScore: 60 },
      git_workflow: { weight: 10, passingScore: 55 },
      documentation: { weight: 10, passingScore: 55 },
      debugging: { weight: 10, passingScore: 60 },
      ai_collaboration: { weight: 5, passingScore: 50 },
      communication: { weight: 10, passingScore: 60 },
    },
  };

  const validationCoverage = validationContract.assertions.map((assertion) => ({
    assertion_id: assertion.id,
    dimension: assertion.dimension,
    status: assertion.id === "A2" ? "partial" : "passed",
    confidence: assertion.id === "A2" ? 0.74 : 0.86,
    evidence: assertion.id === "A2"
      ? [evidence({ file: "src/lib/cart/reducer.test.ts", line_start: 6, line_end: 42, reason: "Unit tests cover core cart transitions.", source: "terminal" })]
      : [evidence({ file: "src/app/api/orders/route.ts", line_start: 18, line_end: 76, reason: `Assertion ${assertion.id} has public-safe demo evidence.`, source: "llm" })],
    responsible_agent: assertion.dimension === "ai_collaboration" ? "ai-collaboration" : assertion.dimension === "communication" ? "interview-gen" : "validator",
    notes: assertion.id === "A2" ? "E2E proof was not supplied, so testing coverage is partial." : "Evidence accepted by validator.",
  }));

  const repoIntelligence = {
    demo_data: true,
    files: [
      { path: "package.json", size: 1900, language: "JSON", role: "config" },
      { path: "src/app/api/orders/route.ts", size: 3100, language: "TypeScript", role: "source" },
      { path: "src/lib/orders/service.ts", size: 2600, language: "TypeScript", role: "source" },
      { path: "src/lib/cart/reducer.ts", size: 1800, language: "TypeScript", role: "source" },
      { path: "src/lib/cart/reducer.test.ts", size: 2200, language: "TypeScript", role: "test" },
      { path: ".github/workflows/ci.yml", size: 900, language: "YAML", role: "ci" },
      { path: "README.md", size: 4200, language: "Markdown", role: "docs" },
      { path: "prisma/schema.prisma", size: 3400, language: "Prisma", role: "config" },
      { path: "Dockerfile", size: 820, language: "Other", role: "config" },
    ],
    fileTreeSummary: {
      totalFiles: 94,
      sourceFiles: 51,
      testFiles: 9,
      configFiles: 10,
      docsFiles: 4,
      ciFiles: 1,
      largestFiles: [
        { path: "src/app/api/orders/route.ts", size: 3100 },
        { path: "src/lib/orders/service.ts", size: 2600 },
      ],
    },
    languages: { TypeScript: 76000, Markdown: 8000, JSON: 5200, YAML: 1200, Prisma: 3400 },
    packageManagers: ["npm"],
    frameworks: ["Next.js", "React", "Prisma", "Zod", "Vitest"],
    routes: [
      { route: "/api/orders", file: "src/app/api/orders/route.ts", kind: "next_api", line_start: 1 },
      { route: "/checkout", file: "src/app/checkout/page.tsx", kind: "next_page", line_start: 1 },
    ],
    components: [
      { name: "CheckoutForm", file: "src/components/checkout/CheckoutForm.tsx", exported: true, line_start: 31 },
      { name: "CartSummary", file: "src/components/cart/CartSummary.tsx", exported: true, line_start: 12 },
    ],
    functions: [
      { name: "createOrder", file: "src/lib/orders/service.ts", exported: true, async: true, line_start: 9 },
      { name: "cartReducer", file: "src/lib/cart/reducer.ts", exported: true, async: false, line_start: 11 },
    ],
    classes: [],
    schemas: [
      { name: "OrderBody", file: "src/app/api/orders/route.ts", library: "zod", line_start: 8 },
      { name: "Prisma usage", file: "src/lib/orders/service.ts", library: "prisma", line_start: 4 },
    ],
    apiClients: [{ file: "src/components/checkout/CheckoutForm.tsx", kind: "fetch", target: "/api/orders", line_start: 88 }],
    testFiles: [{ file: "src/lib/cart/reducer.test.ts", framework: "Vitest", cases: ["adds an item", "updates quantity", "clears cart"] }],
    configFiles: [
      { file: "package.json", kind: "package.json", scripts: { test: "vitest run", build: "next build", typecheck: "tsc --noEmit" } },
      { file: "prisma/schema.prisma", kind: "schema.prisma" },
      { file: "Dockerfile", kind: "Dockerfile" },
    ],
    ciFiles: [".github/workflows/ci.yml"],
    serverClientBoundaries: {
      serverFiles: ["src/lib/orders/service.ts"],
      clientFiles: ["src/components/checkout/CheckoutForm.tsx"],
      apiFiles: ["src/app/api/orders/route.ts"],
      sharedFiles: ["src/lib/cart/reducer.ts"],
    },
    prismaSchemaMap: [{ name: "Prisma usage", file: "src/lib/orders/service.ts", library: "prisma", line_start: 4 }],
    envConfigFiles: [{ file: ".env.example", kind: "example", exposesSecrets: false }],
    dependencyRisks: [],
    scriptMap: { test: "vitest run", build: "next build", typecheck: "tsc --noEmit" },
    testToSourceProximity: [{ testFile: "src/lib/cart/reducer.test.ts", nearestSource: "src/lib/cart/reducer.ts", signal: "same_basename" }],
    commitActivity: { commitCount: 42, firstCommitAt: "2026-04-01T10:00:00.000Z", lastCommitAt: "2026-05-23T15:20:00.000Z" },
    contributors: [{ name: "Casey Candidate", commits: 39 }, { name: "review-bot", commits: 3 }],
    dependencyGraph: [
      { from: "src/app/api/orders/route.ts", to: "zod", kind: "import" },
      { from: "src/lib/orders/service.ts", to: "@prisma/client", kind: "import" },
      { from: "package.json", to: "next", kind: "package" },
    ],
    riskFlags: [
      { severity: "low", reason: "No browser E2E tests detected in seeded demo repository." },
      { severity: "medium", reason: "Payment retry behavior should be reviewed against provider idempotency guarantees.", file: "src/lib/orders/service.ts", line_start: 41 },
    ],
  };

  const ownershipStatus = {
    owner_match: true,
    repo_token_verified: true,
    collaborator_verified: false,
    self_declared: false,
    verification_method: "repo_token_verified",
    ownership_challenge_id: "demo-linked-challenge",
    gh_user: "casey-candidate",
    github_username: "casey-candidate",
    repo_owner: DEMO_REPO.owner,
    confidence: "verified",
    notes: ["Seeded demo ownership is labeled demo data. Live runs must verify ownership through OAuth, gh, or the repository challenge flow."],
  };

  const aiCollaboration = {
    challenge_id: "demo-ai-collab-cart-reducer",
    prompt: "Refactor cart quantity handling and propose tests while explaining how AI output would be reviewed.",
    target_files: ["src/lib/cart/reducer.ts", "src/lib/cart/reducer.test.ts"],
    expected_capabilities: ["prompt design", "test awareness", "hallucination review", "patch review"],
    difficulty: "medium",
    correctness_score: 82,
    explanation_quality_score: 86,
    test_awareness_score: 84,
    review_discipline_score: 83,
    ai_collaboration_maturity_score: 82,
    overall_score: 83,
    tool_used: "Candidate-declared AI workflow, evaluated by SkillProof challenge rubric",
    feedback: "Strong answer: proposes AI as a draft generator, requires reducer tests, and names specific hallucination checks before merge.",
    what_this_proves: ["Can scope AI assistance", "Can require tests", "Can review generated code against existing contracts"],
    evidence: [evidence({ file: "src/lib/cart/reducer.ts", line_start: 11, line_end: 58, reason: "Challenge response stayed grounded in reducer behavior.", source: "challenge" })],
  };

  const employerVerifier = {
    hiring_recommendation: "Strong shortlist",
    confidence: 0.84,
    ownership_status: ownershipStatus,
    verification_level: "repo_interview_verified",
    execution_mode: "hybrid",
    top_verified_skills: ["Architecture", "Communication", "Debugging", "AI Collaboration", "Code Quality"],
    biggest_risks: ["No browser E2E proof in the seeded demo run.", "Security score is capped without dependency audit evidence."],
    best_evidence: [
      evidence({ file: "src/lib/orders/service.ts", line_start: 9, line_end: 64, reason: "Own-code interview and file evidence agree on order workflow boundaries.", source: "interview" }),
      evidence({ file: "src/lib/cart/reducer.test.ts", line_start: 6, line_end: 42, reason: "Terminal-backed tests exercise core cart behavior.", source: "terminal" }),
    ],
    terminal_proof_summary: "Three allowlisted commands passed; public report includes command names and output hashes only.",
    suggested_followup_questions: [
      "Ask Casey to explain how order creation avoids duplicate writes after a payment retry.",
      "Ask what E2E test would catch a checkout regression missed by reducer tests.",
      "Ask how they would review an AI-generated change touching the reducer and API route together.",
    ],
    role_fit_summary: "Strong junior full-stack signal for product teams that need Next.js, TypeScript, testing discipline, and responsible AI usage.",
    shortlist_reason: "Evidence-backed scores, verified ownership, terminal proof, interview evidence, and challenge evidence are present.",
    caution_reason: "Treat as demo data until a judge starts a live run against a real repository.",
  };

  const improvementPlan = {
    seven_day: [
      "Add one Playwright checkout smoke test and save the terminal proof.",
      "Run dependency audit and document the reviewed risks.",
      "Add idempotency notes to the order service README section.",
    ],
    thirty_day: [
      { week: 1, title: "E2E proof", detail: "Cover checkout happy path and payment retry behavior.", files: ["src/app/checkout/page.tsx", "src/lib/orders/service.ts"] },
      { week: 2, title: "Security hardening", detail: "Add dependency review and request logging redaction tests.", files: ["src/app/api/orders/route.ts"] },
      { week: 3, title: "Observability", detail: "Emit structured order workflow events for debugging.", files: ["src/lib/orders/service.ts"] },
      { week: 4, title: "AI review workflow", detail: "Document accepted AI usage and reviewer checklist.", files: ["README.md"] },
    ],
    recommended_tests: ["Playwright checkout smoke test", "Payment retry idempotency test", "Request validation negative tests"],
    git_hygiene: ["Keep PRs small", "Link commits to tested behavior", "Include test command hashes in release notes"],
  };

  const profileSummary = {
    developer_summary:
      "DEMO DATA: Casey shows evidence-backed junior full-stack skill across a seeded Next.js commerce repository. The profile is safe for judges to inspect immediately, but live verification must be run separately for real candidates.",
    verified_skills: ["Architecture", "Code Quality", "Testing", "Debugging", "Communication", "AI Collaboration"],
    improvement_areas: ["Browser E2E coverage", "Dependency audit evidence", "Production incident evidence"],
    employer_recommendation: "Strong shortlist for junior full-stack roles when live ownership and terminal proof are regenerated.",
    evidence_highlights: employerVerifier.best_evidence,
    employer_verifier: employerVerifier,
    improvement_plan: improvementPlan,
  };

  const providerMatrix = {
    demo_data: true,
    orchestrator: "anthropic_api",
    worker: "anthropic_api",
    validator: "anthropic_api",
    interview: "anthropic_api",
    profile: "anthropic_api",
    agents: Object.fromEntries(
      [
        "orchestrator",
        "architecture",
        "code-quality",
        "testing",
        "security",
        "ai-collaboration",
        "documentation",
        "authenticity",
        "interview-gen",
        "answer-evaluator",
        "ai-collaboration-evaluator",
        "validator",
        "employer-verifier",
        "improvement-plan",
        "profile-gen",
      ].map((agentName) => [
        agentName,
        {
          provider: "anthropic_api",
          actualProvider: "anthropic_api",
          model: agentName === "orchestrator" || agentName === "validator" ? "claude-opus-4-7" : "claude-sonnet-4-6",
          actualModel: agentName === "orchestrator" || agentName === "validator" ? "claude-opus-4-7" : "claude-sonnet-4-6",
          status: "completed",
          reasoningBudget: agentName === "orchestrator" || agentName === "validator" ? "high" : "medium",
        },
      ]),
    ),
  };
  providerMatrix.agents["repo-scanner"] = { provider: "deterministic", actualProvider: "deterministic", model: "repo-scanner", actualModel: "repo-scanner", status: "completed", reasoningBudget: "none" };
  providerMatrix.agents["git-evidence"] = { provider: "deterministic", actualProvider: "deterministic", model: "git-evidence", actualModel: "git-evidence", status: "completed", reasoningBudget: "none" };
  providerMatrix.agents["skill-graph"] = { provider: "deterministic", actualProvider: "deterministic", model: "skill-graph", actualModel: "skill-graph", status: "completed", reasoningBudget: "none" };

  return {
    validationContract: json(validationContract),
    validationCoverage: json(validationCoverage),
    validationSummary: json({ total: 5, passed: 4, failed: 0, partial: 1, unknown: 0, evidence_coverage_percentage: 100 }),
    repoIntelligence: json(repoIntelligence),
    contextPack: json({
      meta: { owner: DEMO_REPO.owner, repo: DEMO_REPO.name, defaultBranch: "main", description: "Seeded SkillProof commerce demo", primaryLanguage: "TypeScript", sizeKB: 512, stars: 14, createdAt: "2026-04-01T10:00:00.000Z", updatedAt: "2026-05-23T15:20:00.000Z", topics: ["demo", "nextjs", "skillproof"] },
      detected: { framework: "Next.js", packageManager: "npm", testFramework: "Vitest", hasCI: true, hasDocker: true, hasTypeScript: true },
      filesIndex: { total: 94, all: repoIntelligence.files.map((file: any) => file.path), important: ["src/app/api/orders/route.ts", "src/lib/orders/service.ts", "src/lib/cart/reducer.ts"], config: ["package.json", "prisma/schema.prisma"], tests: ["src/lib/cart/reducer.test.ts"], ci: [".github/workflows/ci.yml"], readme: "README.md" },
      snippets: [],
      commits: [{ sha: "d3m0c0mm17", message: "Add checkout validation and cart tests", author: "Casey Candidate", date: "2026-05-23T15:20:00.000Z" }],
      tokens: { rawEstimate: 18400, packEstimate: 6200 },
      intelligence: repoIntelligence,
    }),
    authenticitySignals: json({
      authenticity_score: 87,
      confidence: 0.84,
      positive_signals: ["Verified repo challenge", "Commit history matches candidate identity", "Own-code interview answers reference real files"],
      risk_signals: ["Seeded demo data: not a live verification run"],
      evidence: [evidence({ file: "git:commit-history", reason: "Contributor summary aligns with candidate identity in seeded demo data.", source: "github_api" })],
      score_source: "llm",
    }),
    improvementPlan: json(improvementPlan),
    employerVerifier: json(employerVerifier),
    aiCollaboration: json(aiCollaboration),
    profileSummary: json(profileSummary),
    providerMatrix: json(providerMatrix),
    ownershipStatus: json(ownershipStatus),
  };
}
