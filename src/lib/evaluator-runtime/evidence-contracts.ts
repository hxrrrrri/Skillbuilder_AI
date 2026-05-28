import { createHash } from "node:crypto";
import type { Evidence, RepoContextPack } from "@/agents/types";
import { publicSafeEvidenceText, redactText } from "./redaction";
import type { EvaluatorSkillCategory } from "./skill-contracts";

export type EvidenceFinding = {
  id?: string;
  runId: string;
  skillRunId?: string | null;
  category: EvaluatorSkillCategory;
  claim: string;
  evidenceType:
    | "file_snippet"
    | "commit"
    | "terminal_command"
    | "test_result"
    | "dependency_file"
    | "config_file"
    | "static_analysis"
    | "interview_answer";
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  commitSha?: string;
  commandRunId?: string;
  confidence: number;
  severity?: "info" | "low" | "medium" | "high" | "critical";
  candidateSafe: boolean;
  employerSafe: boolean;
  publicSafe: boolean;
  adminOnly: boolean;
  redactedText: string;
  rawTextHash?: string;
};

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function categoryFromSkill(slug: string): EvaluatorSkillCategory {
  if (slug.includes("architecture")) return "architecture";
  if (slug.includes("quality")) return "code_quality";
  if (slug.includes("testing")) return "testing";
  if (slug.includes("security")) return "security";
  if (slug.includes("debugging")) return "debugging";
  if (slug.includes("collaboration")) return "ai_collaboration";
  if (slug.includes("commit") || slug.includes("git")) return "git_history";
  if (slug.includes("system-design")) return "system_design";
  if (slug.includes("devops")) return "devops";
  if (slug.includes("frontend")) return "frontend";
  if (slug.includes("backend")) return "backend";
  if (slug.includes("database")) return "database";
  return "architecture";
}

export function evidenceFileExists(pack: RepoContextPack | null, filePath?: string | null): boolean {
  if (!filePath) return true;
  const files = pack?.filesIndex.all ?? [];
  return files.includes(filePath);
}

function evidenceTypeFor(e: Evidence): EvidenceFinding["evidenceType"] {
  if (e.source === "terminal" && (e as any).commandRunId) return "terminal_command";
  if (e.source === "terminal") return "test_result";
  if (e.source === "interview") return "interview_answer";
  if (e.file && /(package\.json|requirements\.txt|pyproject\.toml|go\.mod|cargo\.toml|pom\.xml)$/i.test(e.file)) {
    return "dependency_file";
  }
  if (e.file && /(config|\.ya?ml|\.json|dockerfile|\.env\.example)$/i.test(e.file)) return "config_file";
  if (e.file) return "file_snippet";
  return "static_analysis";
}

export function findingFromLegacyEvidence(input: {
  runId: string;
  skillRunId?: string | null;
  skillSlug: string;
  evidence: Evidence;
  contextPack: RepoContextPack | null;
}): EvidenceFinding {
  const rawClaim = input.evidence.reason || input.evidence.snippet || "Evidence recorded by evaluator.";
  const filePath = input.evidence.file;
  const validFile = evidenceFileExists(input.contextPack, filePath);
  const missingFile = !!filePath && !validFile;
  const source = input.evidence.source ?? "deterministic";
  const claim = missingFile
    ? `Hallucinated file reference detected: ${filePath}`
    : rawClaim;
  const redactedText = publicSafeEvidenceText({
    claim,
    filePath: validFile ? filePath : null,
    lineStart: input.evidence.line_start ?? input.evidence.line,
    lineEnd: input.evidence.line_end ?? input.evidence.line,
    source,
  });
  const includesSnippet = !!input.evidence.snippet;
  return {
    runId: input.runId,
    skillRunId: input.skillRunId ?? null,
    category: categoryFromSkill(input.skillSlug),
    claim: redactText(claim, 800),
    evidenceType: missingFile ? "static_analysis" : evidenceTypeFor(input.evidence),
    filePath: validFile ? filePath : undefined,
    lineStart: input.evidence.line_start ?? input.evidence.line,
    lineEnd: input.evidence.line_end ?? input.evidence.line_start ?? input.evidence.line,
    commandRunId: (input.evidence as any).commandRunId,
    confidence: missingFile ? 0.2 : Math.max(0, Math.min(1, input.evidence.confidence ?? 0.75)),
    severity: missingFile ? "medium" : "info",
    candidateSafe: true,
    employerSafe: !missingFile,
    publicSafe: !missingFile && !includesSnippet,
    adminOnly: false,
    redactedText,
    rawTextHash: sha256Text(JSON.stringify(input.evidence)),
  };
}

export function hallucinatedFinding(input: {
  runId: string;
  skillRunId?: string | null;
  skillSlug: string;
  filePath: string;
}): EvidenceFinding {
  const claim = `Evaluator referenced a file that was not present in the repo snapshot: ${input.filePath}`;
  return {
    runId: input.runId,
    skillRunId: input.skillRunId ?? null,
    category: categoryFromSkill(input.skillSlug),
    claim,
    evidenceType: "static_analysis",
    filePath: undefined,
    confidence: 1,
    severity: "medium",
    candidateSafe: true,
    employerSafe: false,
    publicSafe: false,
    adminOnly: false,
    redactedText: redactText(claim, 500),
    rawTextHash: sha256Text(claim),
  };
}
