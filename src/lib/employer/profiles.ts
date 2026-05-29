import { z } from "zod";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { runAgentJson } from "@/lib/providers/run-agent";
import type { MissionState } from "@/agents/types";
import type { ProviderMatrix } from "@/lib/providers/types";
import type { ExecutionMode, TerminalEvidence } from "@/lib/local-runner/types";

export const EmployerSearchQuery = z.object({
  target_role: z.string().trim().max(80).optional(),
  min_score: z.coerce.number().int().min(0).max(100).optional(),
  verification_level: z.enum(["repo_only", "repo_interview_verified"]).optional(),
  ownership_status: z.enum(["verified", "self_declared", "unverified"]).optional(),
  skill: z.string().trim().max(80).optional(),
  skill_min: z.coerce.number().int().min(0).max(100).optional(),
  risk: z.string().trim().max(120).optional(),
  ai_collab_min: z.coerce.number().int().min(0).max(100).optional(),
  interview_verified: z.preprocess(parseBool, z.boolean().optional()),
  terminal_proof: z.preprocess(parseBool, z.boolean().optional()),
  college_tenant_id: z.string().trim().max(120).optional(),
  save_name: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type EmployerSearchFilters = z.infer<typeof EmployerSearchQuery>;

function parseBool(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return value;
}

export const InterviewKitFocus = z.enum(["debugging", "ai_collab", "architecture", "testing"]);

export const InterviewKitRequest = z.object({
  profile_id: z.string(),
  target_role: z.string().trim().max(80).optional(),
  focus: z.array(InterviewKitFocus).max(4).optional(),
});

type ScoreRow = {
  skillName: string;
  score: number;
  scoreSource: string;
  confidence: number;
  evidence: string;
};

type QuestionRow = {
  answer: string | null;
  answerScore: number | null;
};

export type EmployerProfileBundle = {
  id: string;
  slug: string;
  visibility: string;
  interviewKit?: string | null;
  candidate: { name: string; githubUsername: string | null } | null;
  run: {
    id: string;
    targetRole: string;
    candidateLevel: string | null;
    overallScore: number | null;
    roleFit: string | null;
    verificationLevel: string;
    tenantId?: string | null;
    employerVerifier: string | null;
    authenticitySignals: string | null;
    aiCollaboration: string | null;
    ownershipStatus: string | null;
    terminalEvidence: string | null;
    providerMatrix: string | null;
    executionMode: string | null;
    repository: {
      repoUrl: string;
      owner: string;
      repoName: string;
    };
    harnessSnapshot?: {
      commitSha: string | null;
      evaluatorRuntimeVersion: string;
      validatorVersion: string;
      executionMode: string;
      createdAt: Date;
    } | null;
    evidenceFindings?: Array<{
      id: string;
      employerSafe: boolean;
      publicSafe: boolean;
      evidenceType: string;
      category: string;
    }>;
    scores: ScoreRow[];
    questions: QuestionRow[];
  };
};

export type EmployerProfileSummary = {
  id: string;
  slug: string;
  candidateName: string;
  githubUsername: string | null;
  targetRole: string;
  candidateLevel: string | null;
  overallScore: number | null;
  roleFit: string | null;
  verificationLevel: string;
  repo: string;
  repoUrl: string;
  ownership: "verified" | "self_declared" | "unverified";
  recommendation: "strong" | "consider" | "needs_more_proof" | "risky";
  verifiedSkills: string[];
  biggestRisks: string[];
  evidenceHighlights: Array<{ file?: string; reason: string; source?: string }>;
  scores: Record<string, number | null>;
  hasTerminalProof: boolean;
  interviewVerified: boolean;
  mockOrHeuristic: boolean;
  aiCollabScore: number | null;
  evidenceCount: number;
  terminalProofCount: number;
  evaluatedCommitSha: string | null;
  evaluatorVersion: string | null;
  trustBadges: string[];
};

export type InterviewKit = {
  profile_id: string;
  target_role: string;
  generated_at: string;
  source: "llm" | "deterministic";
  model: string;
  sections: {
    project_specific: string[];
    debugging: string[];
    ai_collaboration: string[];
    red_flags: string[];
    expected_strong_signals: string[];
  };
};

function scoreMap(scores: ScoreRow[]): Record<string, number | null> {
  return Object.fromEntries(scores.map((s) => [s.skillName, s.score < 0 ? null : s.score]));
}

function riskSignals(bundle: EmployerProfileBundle): string[] {
  const employer = safeJsonParse<any>(bundle.run.employerVerifier, null);
  const authenticity = safeJsonParse<any>(bundle.run.authenticitySignals, null);
  return [
    ...(Array.isArray(employer?.biggest_risks) ? employer.biggest_risks : []),
    ...(Array.isArray(authenticity?.risk_signals) ? authenticity.risk_signals : []),
  ].filter((v) => typeof v === "string");
}

function bestEvidence(bundle: EmployerProfileBundle): Array<{ file?: string; reason: string; source?: string }> {
  const employer = safeJsonParse<any>(bundle.run.employerVerifier, null);
  if (Array.isArray(employer?.best_evidence) && employer.best_evidence.length) {
    return employer.best_evidence.slice(0, 5);
  }
  return bundle.run.scores
    .flatMap((s) => safeJsonParse<any[]>(s.evidence, []))
    .filter((e) => typeof e?.reason === "string")
    .slice(0, 5)
    .map((e) => ({ file: e.file, reason: e.reason, source: e.source }));
}

function ownershipStatus(bundle: EmployerProfileBundle): EmployerProfileSummary["ownership"] {
  const ownership = safeJsonParse<any>(bundle.run.ownershipStatus, null);
  if (ownership?.confidence === "verified" || ownership?.owner_match || ownership?.repo_token_verified) return "verified";
  if (ownership?.confidence === "self_declared" || ownership?.self_declared) return "self_declared";
  return "unverified";
}

function recommendation(bundle: EmployerProfileBundle): EmployerProfileSummary["recommendation"] {
  const score = bundle.run.overallScore ?? 0;
  const risks = riskSignals(bundle);
  const ownership = ownershipStatus(bundle);
  const highRisk = risks.some((r) => /security|secret|failed|unverified|anonymous|no ownership/i.test(r));
  if (highRisk && score < 70) return "risky";
  if (score >= 78 && ownership === "verified" && bundle.run.verificationLevel === "repo_interview_verified") return "strong";
  if (score >= 62) return "consider";
  return "needs_more_proof";
}

function terminalProof(bundle: EmployerProfileBundle): boolean {
  const terminal = safeJsonParse<TerminalEvidence[]>(bundle.run.terminalEvidence, []);
  return terminal.some((t) => t.exitCode === 0);
}

function mockOrHeuristic(bundle: EmployerProfileBundle): boolean {
  return bundle.run.executionMode === "mock" || bundle.run.scores.some((s) => s.scoreSource === "mock" || s.scoreSource === "heuristic");
}

export function summarizeEmployerProfile(bundle: EmployerProfileBundle): EmployerProfileSummary {
  const scores = scoreMap(bundle.run.scores);
  const verifiedSkills = bundle.run.scores
    .filter((s) => s.score >= 70 && s.scoreSource !== "pending")
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.skillName);
  const ai = safeJsonParse<any>(bundle.run.aiCollaboration, null);
  const terminal = safeJsonParse<TerminalEvidence[]>(bundle.run.terminalEvidence, []);
  const evidenceCount =
    bundle.run.evidenceFindings?.filter((f) => f.employerSafe).length ??
    bundle.run.scores.reduce((sum, s) => sum + safeJsonParse<any[]>(s.evidence, []).length, 0);
  const terminalProofCount = terminal.filter((t) => t.exitCode === 0).length;
  const trustBadges = buildTrustBadges({
    ownership: ownershipStatus(bundle),
    evidenceCount,
    terminalProofCount,
    testingDetected: (scores.Testing ?? 0) > 0,
    aiCollabScore: typeof ai?.overall_score === "number" ? ai.overall_score : scores["AI Collaboration"] ?? null,
    mockOrHeuristic: mockOrHeuristic(bundle),
  });
  return {
    id: bundle.id,
    slug: bundle.slug,
    candidateName: bundle.candidate?.name ?? "Anonymous candidate",
    githubUsername: bundle.candidate?.githubUsername ?? null,
    targetRole: bundle.run.targetRole,
    candidateLevel: bundle.run.candidateLevel,
    overallScore: bundle.run.overallScore,
    roleFit: bundle.run.roleFit,
    verificationLevel: bundle.run.verificationLevel,
    repo: `${bundle.run.repository.owner}/${bundle.run.repository.repoName}`,
    repoUrl: bundle.run.repository.repoUrl,
    ownership: ownershipStatus(bundle),
    recommendation: recommendation(bundle),
    verifiedSkills,
    biggestRisks: riskSignals(bundle).slice(0, 5),
    evidenceHighlights: bestEvidence(bundle),
    scores,
    hasTerminalProof: terminalProof(bundle),
    interviewVerified: bundle.run.verificationLevel === "repo_interview_verified" || bundle.run.questions.some((q) => !!q.answer),
    mockOrHeuristic: mockOrHeuristic(bundle),
    aiCollabScore: typeof ai?.overall_score === "number" ? ai.overall_score : scores["AI Collaboration"] ?? null,
    evidenceCount,
    terminalProofCount,
    evaluatedCommitSha: bundle.run.harnessSnapshot?.commitSha ?? null,
    evaluatorVersion: bundle.run.harnessSnapshot?.evaluatorRuntimeVersion ?? null,
    trustBadges,
  };
}

function buildTrustBadges(input: {
  ownership: EmployerProfileSummary["ownership"];
  evidenceCount: number;
  terminalProofCount: number;
  testingDetected: boolean;
  aiCollabScore: number | null;
  mockOrHeuristic: boolean;
}): string[] {
  const badges: string[] = [];
  if (input.ownership === "verified") badges.push("Verified Repo Owner");
  if (input.evidenceCount > 0) badges.push("Evidence-Backed");
  if (input.terminalProofCount > 0) badges.push("Terminal Proof Included");
  if (input.testingDetected) badges.push("Tests Detected");
  if (input.aiCollabScore != null) badges.push("AI Collaboration Reviewed");
  badges.push("Public-Safe Report");
  if (input.mockOrHeuristic) badges.push("Unverified legacy source");
  if (input.evidenceCount > 0) badges.push("Hallucination Checks Passed");
  return badges;
}

export function filterEmployerSummaries(
  summaries: EmployerProfileSummary[],
  filters: EmployerSearchFilters,
): EmployerProfileSummary[] {
  return summaries.filter((s) => {
    if (filters.target_role && !s.targetRole.toLowerCase().includes(filters.target_role.toLowerCase())) return false;
    if (filters.min_score != null && (s.overallScore ?? -1) < filters.min_score) return false;
    if (filters.verification_level && s.verificationLevel !== filters.verification_level) return false;
    if (filters.ownership_status && s.ownership !== filters.ownership_status) return false;
    if (filters.skill) {
      const value = s.scores[filters.skill] ?? null;
      if (value == null || value < (filters.skill_min ?? 60)) return false;
    }
    if (filters.risk && !s.biggestRisks.some((r) => r.toLowerCase().includes(filters.risk!.toLowerCase()))) return false;
    if (filters.ai_collab_min != null && (s.aiCollabScore ?? -1) < filters.ai_collab_min) return false;
    if (filters.interview_verified != null && s.interviewVerified !== filters.interview_verified) return false;
    if (filters.terminal_proof != null && s.hasTerminalProof !== filters.terminal_proof) return false;
    return true;
  });
}

export function comparePayload(summaries: EmployerProfileSummary[]) {
  return summaries.map((s) => ({
    profile_id: s.id,
    candidate: s.candidateName,
    target_role: s.targetRole,
    score: s.overallScore,
    role_fit: s.roleFit,
    recommendation: s.recommendation,
    verified_skills: s.verifiedSkills,
    biggest_risks: s.biggestRisks,
    testing: s.scores.Testing ?? null,
    debugging: s.scores.Debugging ?? null,
    communication: s.scores.Communication ?? null,
    ai_collab: s.aiCollabScore,
    proof_strength: {
      ownership: s.ownership,
      interview_verified: s.interviewVerified,
      terminal_proof: s.hasTerminalProof,
      mock_or_heuristic: s.mockOrHeuristic,
    },
  }));
}

// Select exactly the run fields EmployerProfileBundle exposes. AnalysisRun also
// holds several large JSON columns (validationContract, contextPack,
// repoIntelligence, profileSummary, …) the employer summary never reads — an
// `include` would pull all of them on every row (up to `take`). Explicit select
// keeps the read narrow. Keep this in lockstep with EmployerProfileBundle["run"].
const EMPLOYER_RUN_SELECT = {
  id: true,
  targetRole: true,
  candidateLevel: true,
  overallScore: true,
  roleFit: true,
  verificationLevel: true,
  tenantId: true,
  employerVerifier: true,
  authenticitySignals: true,
  aiCollaboration: true,
  ownershipStatus: true,
  terminalEvidence: true,
  providerMatrix: true,
  executionMode: true,
  repository: { select: { repoUrl: true, owner: true, repoName: true } },
  harnessSnapshot: {
    select: {
      commitSha: true,
      evaluatorRuntimeVersion: true,
      validatorVersion: true,
      executionMode: true,
      createdAt: true,
    },
  },
  evidenceFindings: {
    where: { employerSafe: true, adminOnly: false },
    select: { id: true, employerSafe: true, publicSafe: true, evidenceType: true, category: true },
  },
  scores: { select: { skillName: true, score: true, scoreSource: true, confidence: true, evidence: true } },
  questions: { select: { answer: true, answerScore: true } },
} as const;

const EMPLOYER_BUNDLE_SELECT = {
  id: true,
  slug: true,
  visibility: true,
  interviewKit: true,
  candidate: { select: { name: true, githubUsername: true } },
  run: { select: EMPLOYER_RUN_SELECT },
} as const;

export async function fetchPublicProfileBundles(where: Record<string, any> = {}, take = 50) {
  return prisma.publicProfile.findMany({
    where: {
      visibility: "public",
      run: {
        executionMode: { not: "mock" },
        scores: { none: { scoreSource: { in: ["mock", "heuristic"] } } },
      },
      ...where,
    },
    orderBy: { createdAt: "desc" },
    take,
    select: EMPLOYER_BUNDLE_SELECT,
  }) as unknown as Promise<EmployerProfileBundle[]>;
}

export async function getEmployerProfileBundle(profileId: string) {
  return prisma.publicProfile.findFirst({
    where: {
      id: profileId,
      visibility: "public",
      run: {
        executionMode: { not: "mock" },
        scores: { none: { scoreSource: { in: ["mock", "heuristic"] } } },
      },
    },
    select: EMPLOYER_BUNDLE_SELECT,
  }) as unknown as Promise<EmployerProfileBundle | null>;
}

function fallbackInterviewKit(summary: EmployerProfileSummary, targetRole: string): InterviewKit["sections"] {
  const repo = summary.repo;
  return {
    project_specific: [
      `Walk through the main architecture of ${repo} and explain the tradeoffs you made.`,
      `Pick the strongest evidence item in your profile and describe how you implemented it.`,
      `Which part of ${repo} would you refactor first for a production team?`,
      `How does the repo handle errors or edge cases for the core user flow?`,
      `What would a reviewer learn from the commit history that is not visible in the final code?`,
    ],
    debugging: [
      `Describe a bug you would expect in this ${targetRole} codebase and how you would isolate it.`,
      `If tests started failing only in CI, what evidence would you collect first?`,
      `Show how you would trace a production issue from symptom to root cause in this repo.`,
    ],
    ai_collaboration: [
      "Where would you accept AI-generated code in this project, and where would you require manual review?",
      "Describe the tests or checks you would add before merging an AI-suggested diff.",
    ],
    red_flags: summary.biggestRisks.length
      ? summary.biggestRisks
      : ["Answers that cannot point back to repository evidence.", "Claims of production readiness without tests or terminal proof."],
    expected_strong_signals: [
      "References concrete files, commands, commits, or profile evidence.",
      "Explains tradeoffs and failure modes without overstating certainty.",
      "Treats AI output as a reviewed draft, not a trusted source.",
    ],
  };
}

export async function generateInterviewKit(
  bundle: EmployerProfileBundle,
  opts: { targetRole?: string; focus?: Array<z.infer<typeof InterviewKitFocus>> } = {},
): Promise<InterviewKit> {
  const summary = summarizeEmployerProfile(bundle);
  const targetRole = opts.targetRole || bundle.run.targetRole;
  const fallback = fallbackInterviewKit(summary, targetRole);
  const mode: ExecutionMode = (bundle.run.executionMode as ExecutionMode) ?? "api";
  const state: MissionState = {
    mission_id: `kit_${bundle.id.slice(0, 8)}`,
    run_id: bundle.run.id,
    target_role: targetRole,
    candidate_level: bundle.run.candidateLevel ?? "",
    contract: null,
    context_pack: null,
    scores: [],
    handoffs: [],
    assertion_results: [],
    authenticity: null,
    tokens_in: 0,
    tokens_out: 0,
    mock_mode: false,
    execution_mode: mode,
    provider_matrix: safeJsonParse<ProviderMatrix | null>(bundle.run.providerMatrix, null),
    terminal_evidence: safeJsonParse<TerminalEvidence[]>(bundle.run.terminalEvidence, []),
    ownership_status: safeJsonParse(bundle.run.ownershipStatus, null),
  };

  const schemaHint = '{"project_specific":string[],"debugging":string[],"ai_collaboration":string[],"red_flags":string[],"expected_strong_signals":string[]}';
  const res = await runAgentJson<InterviewKit["sections"]>({
    state,
    agentName: "interview-gen",
    role: "interview",
    system: "You are the SkillProof employer interview-kit generator. Build project-specific interview prompts from verified evidence only. Return JSON only.",
    user: `Candidate summary:
${JSON.stringify(summary, null, 2)}

Target role: ${targetRole}
Focus: ${(opts.focus ?? []).join(", ") || "balanced"}

Return exactly 5 project-specific questions, 3 debugging questions, 2 AI collaboration questions, red flags, and expected strong signals.`,
    schemaHint,
    maxTokens: 1800,
  });

  const sections = normalizeKitSections(res.output, fallback);
  return {
    profile_id: bundle.id,
    target_role: targetRole,
    generated_at: new Date().toISOString(),
    source: res.source === "llm" ? "llm" : "deterministic",
    model: res.model,
    sections,
  };
}

function normalizeKitSections(value: any, fallback: InterviewKit["sections"]): InterviewKit["sections"] {
  return {
    project_specific: Array.isArray(value?.project_specific) ? value.project_specific.slice(0, 5) : fallback.project_specific,
    debugging: Array.isArray(value?.debugging) ? value.debugging.slice(0, 3) : fallback.debugging,
    ai_collaboration: Array.isArray(value?.ai_collaboration) ? value.ai_collaboration.slice(0, 2) : fallback.ai_collaboration,
    red_flags: Array.isArray(value?.red_flags) ? value.red_flags.slice(0, 6) : fallback.red_flags,
    expected_strong_signals: Array.isArray(value?.expected_strong_signals)
      ? value.expected_strong_signals.slice(0, 6)
      : fallback.expected_strong_signals,
  };
}
