import { z } from "zod";
import { isAdminRole } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";

export const CohortCreateBody = z.object({
  name: z.string().min(1).max(120),
  year: z.number().int().min(2000).max(2200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const InviteCreateBody = z.object({
  email: z.string().email().max(160).transform((s) => s.toLowerCase().trim()),
  role: z.enum(["candidate", "college_member", "mentor"]).default("candidate"),
  cohortId: z.string().nullable().optional(),
  expiresInDays: z.number().int().min(1).max(60).default(14),
});

export const AcceptInviteBody = z.object({
  token: z.string().min(16),
  password: z.string().min(8).max(200).optional(),
  name: z.string().min(2).max(80).optional(),
  github_username: z.string().min(1).max(80).optional(),
});

export const EmployerShareBody = z.object({
  cohortId: z.string().nullable().optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});

export type CollegeTenantScope = {
  tenantId: string;
  tenantIds: string[];
};

export function resolveCollegeScope(user: SessionUser, requestedTenantId?: string | null): CollegeTenantScope {
  if (isAdminRole(user.role)) {
    const tenantId = requestedTenantId ?? user.primaryTenantId ?? user.tenantIds[0];
    if (!tenantId) throw new CollegeAuthError(400, "tenant_required");
    return { tenantId, tenantIds: requestedTenantId ? [requestedTenantId] : user.tenantIds };
  }
  if (user.tenantIds.length === 0) throw new CollegeAuthError(403, "no_tenant");
  if (requestedTenantId && !user.tenantIds.includes(requestedTenantId)) {
    throw new CollegeAuthError(403, "forbidden_tenant");
  }
  const tenantId = requestedTenantId ?? user.primaryTenantId ?? user.tenantIds[0];
  if (!user.tenantIds.includes(tenantId)) throw new CollegeAuthError(403, "forbidden_tenant");
  return { tenantId, tenantIds: user.tenantIds };
}

export class CollegeAuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function collegeErrorResponse(err: unknown): Response {
  if (err instanceof CollegeAuthError) {
    return Response.json({ error: err.code }, { status: err.status });
  }
  throw err;
}

export function tenantRunWhere(scope: CollegeTenantScope, base: Record<string, any> = {}) {
  return {
    ...base,
    tenantId: { in: scope.tenantIds.length ? scope.tenantIds : [scope.tenantId] },
    executionMode: { not: "mock" },
    scores: { none: { scoreSource: { in: ["mock", "heuristic"] } } },
  };
}

export async function ensureCohortInTenant(cohortId: string, tenantId: string) {
  const cohort = await prisma.cohort.findFirst({ where: { id: cohortId, tenantId } });
  if (!cohort) throw new CollegeAuthError(404, "cohort_not_found");
  return cohort;
}

export const SKILL_GAP_SKILLS = [
  "Testing",
  "Documentation",
  "Communication",
  "Security",
  "Git Workflow",
  "AI Collaboration",
] as const;

export async function getSkillGaps(scope: CollegeTenantScope, cohortId?: string | null) {
  const candidateIds = cohortId
    ? (
        await prisma.cohortStudent.findMany({
          where: { cohortId, cohort: { tenantId: scope.tenantId } },
          select: { candidateId: true },
        })
      ).map((s) => s.candidateId)
    : null;
  const runs = await prisma.analysisRun.findMany({
    where: tenantRunWhere(scope, {
      status: "completed",
      ...(candidateIds ? { candidateId: { in: candidateIds } } : {}),
    }),
    include: { scores: true },
  });
  const gaps = SKILL_GAP_SKILLS.map((skill) => {
    const weak = runs.filter((r) => {
      const score = r.scores.find((s) => s.skillName === skill);
      return score && score.score >= 0 && score.score < 60;
    }).length;
    return { skill, weak_count: weak, total_runs: runs.length };
  }).sort((a, b) => b.weak_count - a.weak_count);
  return { gaps, total_runs: runs.length };
}

export async function getPlacementReady(scope: CollegeTenantScope) {
  const runs = await prisma.analysisRun.findMany({
    where: tenantRunWhere(scope, { status: "completed" }),
    include: { candidate: true, repository: true, profiles: true },
    orderBy: { completedAt: "desc" },
  });
  return runs.map((run) => {
    const ownership = safeJsonParse<any>(run.ownershipStatus, null);
    const terminal = safeJsonParse<any[]>(run.terminalEvidence, []);
    const authenticity = safeJsonParse<any>(run.authenticitySignals, null);
    const securityHighRisk = (authenticity?.risk_signals ?? []).some((r: string) => /security|secret/i.test(r));
    const publicProfile = run.profiles.some((p) => p.visibility === "public");
    const ready =
      (run.overallScore ?? 0) >= 70 &&
      ownership?.confidence === "verified" &&
      run.verificationLevel === "repo_interview_verified" &&
      !securityHighRisk &&
      terminal.some((t) => t.exitCode === 0) &&
      publicProfile;
    return {
      run_id: run.id,
      candidate_id: run.candidateId,
      candidate_name: run.candidate?.name ?? "Unknown student",
      repo: `${run.repository.owner}/${run.repository.repoName}`,
      score: run.overallScore,
      ready,
      checks: {
        score: (run.overallScore ?? 0) >= 70,
        ownership_verified: ownership?.confidence === "verified",
        interview_verified: run.verificationLevel === "repo_interview_verified",
        no_high_risk_security: !securityHighRisk,
        terminal_proof: terminal.some((t) => t.exitCode === 0),
        public_profile: publicProfile,
      },
    };
  });
}

export async function buildCollegeReport(scope: CollegeTenantScope, format: "csv" | "md") {
  const runs = await prisma.analysisRun.findMany({
    where: tenantRunWhere(scope),
    include: { candidate: true, repository: true },
    orderBy: { createdAt: "desc" },
  });
  if (format === "csv") {
    const header = ["candidate", "repo", "target_role", "status", "overall_score", "verification_level"].join(",");
    const lines = runs.map((r) =>
      [
        csv(r.candidate?.name ?? ""),
        csv(`${r.repository.owner}/${r.repository.repoName}`),
        csv(r.targetRole),
        csv(r.status),
        csv(String(r.overallScore ?? "")),
        csv(r.verificationLevel),
      ].join(","),
    );
    return [header, ...lines].join("\n");
  }
  const lines = ["# College SkillProof Report", ""];
  for (const r of runs) {
    lines.push(`- **${r.candidate?.name ?? "Unknown"}** · ${r.repository.owner}/${r.repository.repoName} · ${r.status} · ${r.overallScore ?? "not scored"}`);
  }
  return lines.join("\n");
}

function csv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
