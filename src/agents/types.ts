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
  | "interview-gen"
  | "answer-evaluator"
  | "validator"
  | "skill-graph"
  | "profile-gen";

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
  weaknesses?: string[];
  strengths?: string[];
};

// Validation contract — written by orchestrator BEFORE any analysis.
// Defines correctness independently of implementation.
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

// Structured handoff — every agent emits this.
export type Handoff<T = unknown> = {
  agent: AgentName;
  completed: string[];
  unresolved: string[];
  evidence: Evidence[];
  commands_run?: Array<{ cmd: string; exitCode?: number }>;
  issues_found: string[];
  next_recommended?: AgentName;
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
    important: string[]; // ranked snippets to send to LLMs
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
};

export type CodeQualityOutput = {
  code_quality_score: number;
  observations: string[];
  evidence: Evidence[];
};

export type TestingOutput = {
  testing_score: number;
  test_count: number;
  has_e2e: boolean;
  has_ci: boolean;
  evidence: Evidence[];
};

export type SecurityOutput = {
  security_score: number;
  findings: Array<{ severity: "low" | "med" | "high"; note: string; file?: string }>;
  evidence: Evidence[];
};

export type GitEvidenceOutput = {
  git_workflow_score: number;
  commit_count: number;
  avg_msg_quality: number;
  evidence: Evidence[];
};

export type InterviewQuestion = {
  id: string;
  question: string;
  source_file: string | null;
  expected_signals: string[];
};

export type InterviewGenOutput = {
  questions: InterviewQuestion[];
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
  notes: string[];
};

export type SkillGraphOutput = {
  overall_score: number;
  role_fit: string;
  top_strengths: string[];
  growth_areas: string[];
  skill_graph: Array<{ name: string; score: number; confidence: number; evidence: Evidence[] }>;
};

export type ProfileOutput = {
  developer_summary: string;
  verified_skills: string[];
  improvement_areas: string[];
  employer_recommendation: string;
  evidence_highlights: Evidence[];
};

// Mission state shared across agents.
export type MissionState = {
  mission_id: string;
  run_id: string;
  target_role: string;
  candidate_level: string;
  contract: ValidationContract | null;
  context_pack: RepoContextPack | null;
  scores: ScoreClaim[];
  handoffs: Handoff[];
  tokens_in: number;
  tokens_out: number;
};
