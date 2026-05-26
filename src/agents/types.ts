// Shared types for the Missions architecture.
// Structured handoff is how agents pass state — never raw blobs of memory.

export type AgentName =
  | "orchestrator"
  | "repo-scanner"
  | "architecture"
  | "code-quality"
  | "testing"
  | "security"
  | "git-evidence"
  | "documentation"
  | "authenticity"
  | "interview-gen"
  | "answer-evaluator"
  | "validator"
  | "skill-graph"
  | "profile-gen";

export type ScoreSource = "llm" | "heuristic" | "mock" | "pending";

export type Evidence = {
  file?: string;
  line?: number;
  reason: string;
  snippet?: string;
};

export type ScoreClaim = {
  skill: string;
  score: number; // 0-100
  evidence: Evidence[];
  confidence?: number; // 0-1
  source?: ScoreSource;
  weaknesses?: string[];
  strengths?: string[];
  assertion_ids?: string[]; // contract assertion IDs this score addresses
};

// Validation contract — written by orchestrator BEFORE any analysis.
export type ValidationContract = {
  mission_id: string;
  target_role: string;
  candidate_level: string;
  evaluation_dimensions: string[];
  assertions: Array<{
    id: string;
    dimension: string;
    statement: string;
    weight: number;
  }>;
  rubric: Record<string, { weight: number; passingScore: number }>;
};

// Result of one assertion after analysis — produced by responsible agent.
export type ValidationAssertionResult = {
  assertion_id: string;
  dimension: string;
  status: "passed" | "failed" | "partial" | "unknown";
  evidence: Evidence[];
  responsible_agent: AgentName;
  notes: string;
};

// Structured handoff — every agent emits this.
export type Handoff<T = unknown> = {
  agent: AgentName;
  completed: string[];
  unresolved: string[];
  evidence: Evidence[];
  commands_run?: Array<{ cmd: string; exitCode?: number }>;
  issues_found: string[];
  next_recommended?: AgentName;
  assertion_results?: ValidationAssertionResult[];
  output: T;
};

// Repo Scanner output — small context pack the rest of the pipeline reads.
export type RepoContextPack = {
  meta: {
    owner: string;
    repo: string;
    defaultBranch: string;
    description: string | null;
    primaryLanguage: string | null;
    sizeKB: number;
    stars: number;
    createdAt: string;
    updatedAt: string;
    topics: string[];
  };
  detected: {
    framework: string | null;
    packageManager: string | null;
    testFramework: string | null;
    hasCI: boolean;
    hasDocker: boolean;
    hasTypeScript: boolean;
  };
  filesIndex: {
    total: number;
    all: string[]; // every blob path — used by validator truth set
    important: string[];
    config: string[];
    tests: string[];
    ci: string[];
    readme: string | null;
  };
  snippets: Array<{ path: string; content: string; truncated: boolean }>;
  commits: Array<{ sha: string; message: string; author: string | null; date: string }>;
  tokens: { rawEstimate: number; packEstimate: number };
};

export type ArchitectureOutput = {
  architecture_score: number;
  strengths: string[];
  weaknesses: string[];
  evidence: Evidence[];
  score_source?: ScoreSource;
  assertion_results?: ValidationAssertionResult[];
};

export type CodeQualityOutput = {
  code_quality_score: number;
  observations: string[];
  evidence: Evidence[];
  score_source?: ScoreSource;
  assertion_results?: ValidationAssertionResult[];
};

export type TestingOutput = {
  testing_score: number;
  test_count: number;
  has_e2e: boolean;
  has_ci: boolean;
  evidence: Evidence[];
  score_source?: ScoreSource;
  assertion_results?: ValidationAssertionResult[];
};

export type SecurityOutput = {
  security_score: number;
  findings: Array<{ severity: "low" | "med" | "high"; note: string; file?: string }>;
  evidence: Evidence[];
  score_source?: ScoreSource;
  assertion_results?: ValidationAssertionResult[];
};

export type GitEvidenceOutput = {
  git_workflow_score: number;
  commit_count: number;
  avg_msg_quality: number;
  evidence: Evidence[];
  score_source?: ScoreSource;
  assertion_results?: ValidationAssertionResult[];
};

export type DocumentationOutput = {
  documentation_score: number;
  has_readme: boolean;
  readme_specificity: number;
  evidence: Evidence[];
  score_source?: ScoreSource;
  assertion_results?: ValidationAssertionResult[];
};

export type AuthenticityOutput = {
  authenticity_score: number;
  confidence: number;
  positive_signals: string[];
  risk_signals: string[];
  evidence: Evidence[];
  score_source?: ScoreSource;
  assertion_results?: ValidationAssertionResult[];
};

export type InterviewQuestionT = {
  id: string;
  question: string;
  source_file: string | null;
  expected_signals: string[];
};

export type InterviewGenOutput = {
  questions: InterviewQuestionT[];
};

export type AnswerEvaluation = {
  communication_score: number;
  debugging_score: number;
  architecture_explanation_score: number;
  testing_reasoning_score: number;
  understanding_of_own_code: number;
  summary: string;
};

export type ValidatorOutput = {
  validated: boolean;
  confidence: number;
  unsupported_claims_removed: number;
  adjusted_scores: Array<{ skill: string; before: number; after: number; reason: string }>;
  hallucinated_files: string[];
  notes: string[];
  assertion_coverage: ValidationAssertionResult[];
};

export type SkillGraphOutput = {
  overall_score: number;
  role_fit: string;
  top_strengths: string[];
  growth_areas: string[];
  skill_graph: Array<{
    name: string;
    score: number | null; // null = not measured
    confidence: number;
    source: ScoreSource;
    evidence: Evidence[];
    weight: number;
    assertion_ids?: string[];
    validator_notes?: string | null;
  }>;
  not_measured: string[];
};

export type EmployerVerifier = {
  hiring_recommendation: "Strong shortlist" | "Consider with reservations" | "Needs more proof";
  top_verified_skills: string[];
  biggest_risks: string[];
  best_evidence: Evidence[];
  suggested_followup_questions: string[];
  role_fit_summary: string;
};

export type ImprovementPlanItem = {
  week: number; // 1..4
  title: string;
  detail: string;
  files?: string[];
};

export type ImprovementPlan = {
  seven_day: string[];
  thirty_day: ImprovementPlanItem[];
  recommended_tests: string[];
  git_hygiene: string[];
};

export type AICollabEvaluation = {
  correctness_score: number;
  explanation_quality_score: number;
  test_awareness_score: number;
  review_discipline_score: number;
  ai_collaboration_maturity_score: number;
  overall_score: number;
  tool_used: string;
  feedback: string;
};

export type ProfileOutput = {
  developer_summary: string;
  verified_skills: string[];
  improvement_areas: string[];
  employer_recommendation: string;
  evidence_highlights: Evidence[];
  employer_verifier: EmployerVerifier;
  improvement_plan: ImprovementPlan;
};

// Mission state shared across agents.
export type MissionState = {
  mission_id: string;
  run_id: string;
  target_role: string;
  candidate_level: string;
  candidate_name?: string | null;
  github_username?: string | null;
  contract: ValidationContract | null;
  context_pack: RepoContextPack | null;
  scores: ScoreClaim[];
  handoffs: Handoff[];
  assertion_results: ValidationAssertionResult[];
  authenticity?: AuthenticityOutput | null;
  tokens_in: number;
  tokens_out: number;
  mock_mode: boolean;
};
