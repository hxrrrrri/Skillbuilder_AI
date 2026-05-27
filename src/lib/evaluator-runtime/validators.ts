import { z } from "zod";
import type { EvaluatorSkillManifest } from "./skill-contracts";

export const EvidenceFindingSchema = z.object({
  id: z.string().optional(),
  runId: z.string(),
  skillRunId: z.string().nullish(),
  category: z.enum([
    "architecture",
    "code_quality",
    "testing",
    "security",
    "debugging",
    "ai_collaboration",
    "git_history",
    "devops",
    "frontend",
    "backend",
    "database",
    "system_design",
  ]),
  claim: z.string().min(1),
  evidenceType: z.enum([
    "file_snippet",
    "commit",
    "terminal_command",
    "test_result",
    "dependency_file",
    "config_file",
    "static_analysis",
    "interview_answer",
  ]),
  filePath: z.string().optional(),
  lineStart: z.number().int().optional(),
  lineEnd: z.number().int().optional(),
  commitSha: z.string().optional(),
  commandRunId: z.string().optional(),
  confidence: z.number().min(0).max(1),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  candidateSafe: z.boolean(),
  employerSafe: z.boolean(),
  publicSafe: z.boolean(),
  adminOnly: z.boolean(),
  redactedText: z.string(),
  rawTextHash: z.string().optional(),
});

export const EvaluatorSkillOutputSchema = z.object({
  skillId: z.string(),
  skillVersion: z.string(),
  status: z.enum(["passed", "warning", "failed"]),
  summary: z.string(),
  scoreDelta: z.number(),
  confidence: z.number().min(0).max(1),
  findings: z.array(EvidenceFindingSchema),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  redFlags: z.array(z.string()),
  interviewQuestions: z.array(
    z.object({
      question: z.string(),
      focusArea: z.string(),
      expectedStrongSignal: z.string(),
      redFlagAnswer: z.string(),
      evidenceReferenceIds: z.array(z.string()),
    }),
  ),
  improvementPlan: z.array(
    z.object({
      priority: z.enum(["P0", "P1", "P2"]),
      title: z.string(),
      reason: z.string(),
      suggestedAction: z.string(),
      evidenceReferenceIds: z.array(z.string()),
    }),
  ),
  publicSafeSummary: z.string(),
  employerSafeSummary: z.string(),
  candidateSafeSummary: z.string(),
  adminNotes: z.string().optional(),
});

export function validateSkillManifest(manifest: EvaluatorSkillManifest): string[] {
  const errors: string[] = [];
  if (!manifest.id) errors.push("id is required");
  if (!manifest.name) errors.push("name is required");
  if (!manifest.version) errors.push("version is required");
  if (!manifest.category) errors.push("category is required");
  if (!manifest.requiredInputs.length) errors.push("requiredInputs must not be empty");
  if (!manifest.produces.length) errors.push("produces must not be empty");
  if (!manifest.body.includes("## Purpose")) errors.push("body must define Purpose");
  if (!manifest.body.includes("## Required Evidence")) errors.push("body must define Required Evidence");
  if (!manifest.body.includes("## Output JSON Schema")) errors.push("body must define Output JSON Schema");
  return errors;
}
