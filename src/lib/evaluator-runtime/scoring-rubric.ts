export const EVALUATOR_RUBRIC_VERSION = "0.1.0";

export const SKILL_RUBRIC_WEIGHTS: Record<string, number> = {
  "repo-architecture-review": 15,
  "code-quality-review": 15,
  "testing-depth-review": 15,
  "security-review": 10,
  "debugging-ability-review": 15,
  "ai-collaboration-review": 5,
  "git-commit-quality-review": 10,
  "system-design-review": 5,
  "frontend-review": 5,
  "backend-review": 5,
  "database-review": 5,
  "devops-readiness-review": 5,
};

export function confidenceLabel(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.55) return "medium";
  return "low";
}
