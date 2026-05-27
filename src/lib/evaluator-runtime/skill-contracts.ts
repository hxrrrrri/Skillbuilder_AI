export const EVALUATOR_RUNTIME_VERSION = "0.1.0";
export const VALIDATOR_VERSION = "0.1.0";

export type EvaluatorSkillCategory =
  | "architecture"
  | "code_quality"
  | "testing"
  | "security"
  | "debugging"
  | "ai_collaboration"
  | "git_history"
  | "devops"
  | "frontend"
  | "backend"
  | "database"
  | "system_design";

export type EvaluatorSkillManifest = {
  id: string;
  name: string;
  version: string;
  category: EvaluatorSkillCategory;
  visibility: "internal" | "candidate" | "employer" | "public";
  allowedRoles: string[];
  requiredInputs: string[];
  produces: string[];
  toolPermissions: ToolPermissionPolicy;
  riskLevel: "low" | "medium" | "high";
  description?: string;
  sourcePath: string;
  body: string;
};

export type ToolPermissionPolicy = {
  filesystem: "none" | "read_only" | "write_sandbox_only";
  terminal: "none" | "safe_commands_only" | "approval_required" | "admin_only";
  github: "none" | "public_read" | "token_read" | "repo_collab_check";
  network: "disabled" | "allowlisted_only";
  mcp?: "disabled" | "allowlisted_only";
  secrets?: "never_expose";
};

export type InterviewSignal = {
  question: string;
  focusArea: string;
  expectedStrongSignal: string;
  redFlagAnswer: string;
  evidenceReferenceIds: string[];
};

export type ImprovementPlanItem = {
  priority: "P0" | "P1" | "P2";
  title: string;
  reason: string;
  suggestedAction: string;
  evidenceReferenceIds: string[];
};

export type EvaluatorSkillOutput = {
  skillId: string;
  skillVersion: string;
  status: "passed" | "warning" | "failed";
  summary: string;
  scoreDelta: number;
  confidence: number;
  findings: unknown[];
  strengths: string[];
  weaknesses: string[];
  redFlags: string[];
  interviewQuestions: InterviewSignal[];
  improvementPlan: ImprovementPlanItem[];
  publicSafeSummary: string;
  employerSafeSummary: string;
  candidateSafeSummary: string;
  adminNotes?: string;
};
