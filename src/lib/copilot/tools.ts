// Typed tool/action registry for the SkillProof Command Copilot.
//
// Tools are the ONLY way the assistant can read or change the system. Each tool
// declares a RiskLevel and a mode (help/admin/both). Read tools execute
// immediately; write tools produce a plan (intent/affected/before/after/risks/
// rollback) and require explicit admin approval before `apply` runs; forbidden
// tools never execute. Permission is resolved here from the registry + the
// server-trusted session role — never from the user's message — which is what
// makes the surface prompt-injection resistant.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAdminRole } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import {
  listAgentConfigs,
  listProviderConfigs,
  getAgentConfig,
  updateAgentConfig,
  updateProviderConfig,
  listPromptVersions,
  createPromptVersion,
  activatePromptVersion,
  getActivePrompt,
} from "@/lib/providers/registry";
import { invalidateProviderRegistryCache } from "@/lib/providers/cache";
import { listProviderHealth, checkProviderReadinessForMode } from "@/lib/providers/provider-router";
import { defaultModelForProvider } from "@/lib/providers/model-catalog";
import { reasoningSupportedByProvider } from "@/lib/providers/reasoning";
import { getPublicProfilePublishBlockers } from "@/lib/profile-publish-gates";
import { safeJsonParse } from "@/lib/utils";
import { searchKnowledge } from "./knowledge";
import { buildHelpGuidance, ROUTE_MAP } from "./context";
import { redactDeep } from "./redaction";
import type { RiskLevel } from "./risk";

export type ToolMode = "help" | "admin" | "both";

export type ToolContext = {
  user: SessionUser | null;
  mode: "help" | "admin";
};

export type ToolPlan = {
  intent: string;
  affected: string[];
  before: unknown;
  after: unknown;
  risks: string[];
  rollback: string;
};

export type ToolDef = {
  name: string;
  risk: RiskLevel;
  mode: ToolMode;
  title: string;
  description: string;
  input: z.ZodTypeAny;
  /** Read tools: execute immediately and return data. */
  run?: (ctx: ToolContext, input: any) => Promise<unknown>;
  /** Write tools: compute a before/after plan for approval. */
  plan?: (ctx: ToolContext, input: any) => Promise<ToolPlan>;
  /** Write tools: perform the mutation after approval. */
  apply?: (ctx: ToolContext, input: any) => Promise<unknown>;
};

/** Thrown by a tool when a precondition fails (e.g. target provider not ready). */
export class ToolPreconditionError extends Error {
  code: string;
  fix: string;
  route?: string;
  constructor(opts: { code: string; message: string; fix: string; route?: string }) {
    super(opts.message);
    this.name = "ToolPreconditionError";
    this.code = opts.code;
    this.fix = opts.fix;
    this.route = opts.route;
  }
}

// --------------- shared helpers ---------------

function pick<T extends Record<string, any>>(obj: T, keys: string[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) if (k in obj) (out as any)[k] = obj[k];
  return out;
}

async function assertProviderHealthy(providerId: string): Promise<void> {
  const [rows, health] = await Promise.all([
    listProviderConfigs().catch(() => [] as any[]),
    listProviderHealth().catch(() => [] as any[]),
  ]);
  const row = rows.find((r: any) => r.providerId === providerId);
  const h = health.find((x: any) => x.providerId === providerId);
  const ready = !!row?.enabled && (h?.status === "ready" || (row?.lastTestStatus === "ok" && row?.lastTestJsonOk === true));
  if (!ready) {
    throw new ToolPreconditionError({
      code: "provider_not_ready",
      message: `Provider '${providerId}' is not ready (enabled=${!!row?.enabled}, health=${h?.status ?? "unknown"}).`,
      fix: h?.fix || "Open Admin → Providers → Health, configure the provider, and run a passing JSON contract test.",
      route: "/admin/providers/health",
    });
  }
}

function modelForBulk(providerId: string, requested: string | undefined, rows: any[]): string {
  if (requested) return requested;
  const row = rows.find((r) => r.providerId === providerId);
  return defaultModelForProvider(providerId, row?.defaultModel ?? null);
}

type AdminDataResult = {
  ok: boolean;
  query?: Record<string, unknown>;
  count?: number;
  items?: unknown[];
  detail?: unknown;
  routes?: string[];
  notes?: string[];
};

function adminDataResult(result: AdminDataResult): AdminDataResult {
  return redactDeep(result);
}

function limitOf(input: any, fallback = 25, max = 100): number {
  const n = typeof input?.limit === "number" ? input.limit : fallback;
  return Math.max(1, Math.min(max, Math.trunc(n)));
}

function iso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function compact<T>(items: Array<T | null | undefined | false>): T[] {
  return items.filter(Boolean) as T[];
}

function sortRunsDesc(runs: any[]): any[] {
  return [...(runs ?? [])].sort((a, b) => {
    const ad = new Date(a.completedAt ?? a.createdAt ?? 0).getTime();
    const bd = new Date(b.completedAt ?? b.createdAt ?? 0).getTime();
    return bd - ad;
  });
}

function scoresFromRuns(runs: any[]): any[] {
  return (runs ?? []).flatMap((run) => run.scores ?? []).filter((s) => typeof s.score === "number" && s.score >= 0);
}

function scoreSummary(scores: any[]) {
  const ordered = [...scores].sort((a, b) => b.score - a.score);
  return {
    top: ordered.slice(0, 3).map((s) => ({ skillName: s.skillName, score: s.score, source: s.scoreSource })),
    weakest: [...ordered].reverse().slice(0, 3).map((s) => ({ skillName: s.skillName, score: s.score, source: s.scoreSource })),
    strongestSkill: ordered[0] ? { skillName: ordered[0].skillName, score: ordered[0].score } : null,
    weakestSkill: ordered.length ? { skillName: ordered[ordered.length - 1].skillName, score: ordered[ordered.length - 1].score } : null,
  };
}

function latestProfile(profiles: any[]): any | null {
  return [...(profiles ?? [])].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0] ?? null;
}

function repoName(repo: any): string | null {
  if (!repo) return null;
  return `${repo.owner}/${repo.repoName}`;
}

function candidateCohorts(candidate: any) {
  return (candidate?.cohortMemberships ?? []).map((m: any) => ({
    id: m.cohort?.id ?? m.cohortId,
    name: m.cohort?.name ?? null,
    year: m.cohort?.year ?? null,
    tenant: m.cohort?.tenant ? { id: m.cohort.tenant.id, name: m.cohort.tenant.name, kind: m.cohort.tenant.kind } : null,
  }));
}

function routeSet(routes: Array<string | null | undefined>): string[] {
  return Array.from(new Set(compact(routes)));
}

function profileItem(row: any) {
  const run = row.run ?? {};
  const candidate = row.candidate ?? run.candidate ?? {};
  const scores = run.scores ?? [];
  const skillSummary = scoreSummary(scores);
  const ownerUserId = row.owner?.id ?? row.ownerUserId ?? null;
  const runId = row.runId ?? run.id ?? null;
  const profileRoute = `/profile/${row.slug}`;
  const runRoute = runId ? `/admin/runs/${runId}` : null;
  const userRoute = ownerUserId ? `/admin/users/${ownerUserId}` : null;
  return {
    candidate: {
      id: candidate.id ?? row.candidateId ?? null,
      name: candidate.name ?? null,
      email: candidate.email ?? null,
      githubUsername: candidate.githubUsername ?? null,
      ownerUserEmail: row.owner?.email ?? null,
      cohorts: candidateCohorts(candidate),
    },
    tenant: run.tenant ? { id: run.tenant.id, name: run.tenant.name, kind: run.tenant.kind } : null,
    profile: {
      id: row.id,
      slug: row.slug,
      visibility: row.visibility,
      createdAt: iso(row.createdAt),
      route: profileRoute,
    },
    run: {
      id: runId,
      status: run.status ?? null,
      targetRole: run.targetRole ?? null,
      overallScore: run.overallScore ?? null,
      verificationLevel: run.verificationLevel ?? null,
      completedAt: iso(run.completedAt),
      route: runRoute,
    },
    repository: run.repository
      ? { owner: run.repository.owner, name: run.repository.repoName, fullName: repoName(run.repository), url: run.repository.repoUrl }
      : null,
    skills: { top: skillSummary.top, weakest: skillSummary.weakest },
    routes: routeSet([profileRoute, runRoute, userRoute]),
  };
}

function candidateSummaryItem(candidate: any) {
  const runs = sortRunsDesc(candidate.runs ?? []);
  const latest = runs[0] ?? null;
  const completed = runs.filter((r) => r.status === "completed");
  const scores = scoresFromRuns(runs);
  const summary = scoreSummary(scores);
  const bestRun = runs.reduce((best, run) => ((run.overallScore ?? -1) > (best?.overallScore ?? -1) ? run : best), null as any);
  const profile = latestProfile(candidate.profiles ?? runs.flatMap((r) => r.profiles ?? []));
  return {
    candidate: {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      githubUsername: candidate.githubUsername,
    },
    linkedUserEmail: candidate.user?.email ?? null,
    cohorts: candidateCohorts(candidate),
    repositoriesCount: candidate.repositories?.length ?? 0,
    runsCount: runs.length,
    completedRunsCount: completed.length,
    profilesCount: candidate.profiles?.length ?? 0,
    latestRun: latest
      ? {
          id: latest.id,
          status: latest.status,
          targetRole: latest.targetRole,
          overallScore: latest.overallScore,
          verificationLevel: latest.verificationLevel,
          repository: latest.repository ? repoName(latest.repository) : null,
          route: `/admin/runs/${latest.id}`,
        }
      : null,
    bestScore: bestRun?.overallScore ?? null,
    strongestSkill: summary.strongestSkill,
    weakestSkill: summary.weakestSkill,
    latestProfileSlug: profile?.slug ?? null,
    routes: routeSet([
      candidate.id ? `/college/students/${candidate.id}` : null,
      profile?.slug ? `/profile/${profile.slug}` : null,
      latest?.id ? `/admin/runs/${latest.id}` : null,
      candidate.user?.id ? `/admin/users/${candidate.user.id}` : null,
    ]),
  };
}

function evidenceCategoryCounts(findings: any[]): Record<string, number> {
  return (findings ?? []).reduce((acc: Record<string, number>, f: any) => {
    const key = f.category ?? "uncategorized";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function studentDetail(candidate: any) {
  const runs = sortRunsDesc(candidate.runs ?? []);
  const latest = runs[0] ?? null;
  const latestScores = latest?.scores ?? [];
  const profiles = candidate.profiles ?? runs.flatMap((r) => r.profiles ?? []);
  const routes = routeSet([
    candidate.id ? `/college/students/${candidate.id}` : null,
    ...profiles.map((p: any) => (p.slug ? `/profile/${p.slug}` : null)),
    ...runs.map((r: any) => (r.id ? `/admin/runs/${r.id}` : null)),
    candidate.user?.id ? `/admin/users/${candidate.user.id}` : null,
  ]);
  return {
    candidate: {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      githubUsername: candidate.githubUsername,
      createdAt: iso(candidate.createdAt),
    },
    linkedUser: candidate.user
      ? {
          id: candidate.user.id,
          email: candidate.user.email,
          name: candidate.user.name,
          role: candidate.user.role,
          status: candidate.user.status,
          primaryTenant: candidate.user.primaryTenant
            ? { id: candidate.user.primaryTenant.id, name: candidate.user.primaryTenant.name, kind: candidate.user.primaryTenant.kind }
            : null,
        }
      : null,
    tenantMemberships: (candidate.user?.memberships ?? []).map((m: any) => ({
      role: m.role,
      tenant: m.tenant ? { id: m.tenant.id, name: m.tenant.name, kind: m.tenant.kind } : null,
    })),
    cohortMemberships: candidateCohorts(candidate),
    repositories: (candidate.repositories ?? []).map((r: any) => ({
      id: r.id,
      owner: r.owner,
      name: r.repoName,
      url: r.repoUrl,
      primaryLanguage: r.primaryLanguage,
      framework: r.framework,
    })),
    runs: runs.map((r: any) => ({
      id: r.id,
      status: r.status,
      targetRole: r.targetRole,
      overallScore: r.overallScore,
      verificationLevel: r.verificationLevel,
      ownershipConfidence: safeJsonParse<any>(r.ownershipStatus, {})?.confidence ?? null,
      terminalProofAvailable: safeJsonParse<any[]>(r.terminalEvidence, []).some((t) => t.exitCode === 0),
      repository: r.repository ? { id: r.repository.id, owner: r.repository.owner, name: r.repository.repoName, url: r.repository.repoUrl } : null,
      createdAt: iso(r.createdAt),
      completedAt: iso(r.completedAt),
      route: `/admin/runs/${r.id}`,
    })),
    profiles: profiles.map((p: any) => ({
      id: p.id,
      slug: p.slug,
      visibility: p.visibility,
      createdAt: iso(p.createdAt),
      route: p.slug ? `/profile/${p.slug}` : null,
    })),
    latestRunScores: latestScores.map((s: any) => ({ skillName: s.skillName, score: s.score, source: s.scoreSource })),
    latestRunEvidenceSummary: latest ? evidenceCategoryCounts(latest.evidenceFindings ?? []) : {},
    latestRunInterview: latest
      ? {
          questionCount: latest.questions?.length ?? 0,
          answeredCount: (latest.questions ?? []).filter((q: any) => !!q.answer).length,
        }
      : null,
    improvementPlanSummary: latest ? safeJsonParse<any>(latest.improvementPlan, null) : null,
    employerVerifierSummary: latest ? safeJsonParse<any>(latest.employerVerifier, null) : null,
    authenticitySummary: latest ? safeJsonParse<any>(latest.authenticitySignals, null) : null,
    routes,
  };
}

const DATA_MODEL_EXPLANATION = {
  User: "Accounts and RBAC. Stores email, role, status, primaryTenantId, optional githubUsername; owns created runs and public profiles.",
  Candidate: "Student/candidate identity. May link to one User through userId, owns repositories, analysis runs, public profiles, cohort memberships, and reverification snapshots.",
  Repository: "GitHub repository metadata for a candidate: owner, repoName, repoUrl, language/framework, and related AnalysisRun rows.",
  AnalysisRun: "Verification workflow instance. Stores candidate, tenant, repo, targetRole, status, scores, evidence summaries, ownership, provider matrix, terminal proof summaries, and completion time.",
  SkillScore: "Per-skill score rows for an AnalysisRun. scoreSource records whether evidence came from LLM, terminal, GitHub, local clone, interview, challenge, deterministic, or not_measured.",
  EvidenceFinding: "Evidence claims linked to runs and skill runs. Stores safe flags, confidence, file/commit references, redactedText, and rawTextHash rather than raw private evidence.",
  PublicProfile: "Published or draft profile row for a run. Stores slug, visibility, candidateId, ownerUserId, includeTerminalProof, and cached interview kit.",
  Tenant: "College, employer, or platform organization. Owns memberships, runs, cohorts, invites, audit logs, and talent-share links.",
  Cohort: "Tenant-scoped student group with year/notes, invite rows, and CohortStudent memberships.",
  CohortStudent: "Join table connecting Candidate rows to Cohort rows.",
  ProviderConfig: "Admin-managed provider readiness/configuration. Stores provider id, kind, default model, command/base URL, env var names, and redacted health-test metadata.",
  AgentConfig: "Admin-managed provider/model/reasoning settings per evaluator agent.",
  PromptVersion: "Versioned system/instruction prompt rows per agent. Active version controls the next run.",
  ChatSession: "Copilot conversation container with mode and captured role.",
  ChatMessage: "Persisted user/assistant messages plus redacted metadata.",
  ChatToolCall: "Every copilot tool request/proposal/execution, with input/output JSON snapshots and risk level.",
  ChatActionApproval: "Approval gate for write/destructive tool calls, including status, expiry, approver, and typed confirmation text when required.",
};

const PROJECT_ARCHITECTURE_EXPLANATION = {
  roles: "candidate proves skills, employer consumes public/shared verified profiles, college reads tenant-scoped student/cohort readiness, and admin operates cross-platform data, providers, agents, prompts, evidence, audit, and billing surfaces.",
  routes: "Next.js App Router pages live under src/app. Admin surfaces include /admin/users, /admin/runs, /admin/profiles, /admin/providers, /admin/agents, /admin/prompts, and /admin/copilot. Candidate, employer, college, and public profile routes are separate role surfaces.",
  verificationWorkflow: "A candidate creates an AnalysisRun for a Repository. Agents produce SkillScore, EvidenceFinding, interview, ownership, terminal, profile, improvement, and verifier summaries. A PublicProfile points back to the run when publishing is allowed.",
  providerSystem: "ProviderConfig and AgentConfig drive the provider registry. Provider health gates mission start and copilot provider selection; deterministic is reserved for evidence-derived stages.",
  agentPipeline: "The orchestrator and evaluator agents run through provider adapters, emit structured JSON, persist skill runs/events/evidence/scores, and fail closed when required evidence or provider contracts are missing.",
  workerMode: "When SKILLPROOF_WORKER_MODE=1, API requests enqueue pending runs and src/worker.ts performs the pipeline. Without it, local development can run in-process with visible fallback banners.",
  evidenceModel: "EvidenceFinding stores redacted evidence with candidate/employer/public/admin safety flags. Raw logs, raw prompts, raw model traces, raw terminal output, and secrets are not surfaced.",
  publicProfilePublishing: "Public/unlisted visibility is gated by getPublicProfilePublishBlockers. Visibility changes rerun gates; admin tools cannot bypass them.",
  adminSurfaces: "Admin pages inspect and operate users, tenants, runs, evidence, providers, agents, prompts, profiles, audit logs, security policy, settings, and the copilot.",
  copilotSecurityModel: "The copilot advertises only allowed tools for the server-trusted role/mode. Read tools execute immediately and are audited; write tools require approval; destructive tools require typed confirmation; forbidden tools never execute.",
};

const ROUTE_FEATURES = [
  { route: "/admin/profiles", purpose: "Moderate public profile rows and visibility.", files: ["src/app/admin/profiles/page.tsx", "src/app/admin/profiles/row.tsx"], models: ["PublicProfile", "Candidate", "User", "AnalysisRun", "Repository"], roleAccess: "admin/super_admin" },
  { route: "/admin/users", purpose: "Search and inspect platform users.", files: ["src/app/admin/users/page.tsx"], models: ["User", "Tenant", "TenantMembership", "AnalysisRun", "PublicProfile"], roleAccess: "admin/super_admin" },
  { route: "/admin/users/[id]", purpose: "Detailed admin user view.", files: ["src/app/admin/users/[id]/page.tsx"], models: ["User", "TenantMembership", "AnalysisRun", "PublicProfile"], roleAccess: "admin/super_admin" },
  { route: "/admin/runs", purpose: "Search all verification runs.", files: ["src/app/admin/runs/page.tsx"], models: ["AnalysisRun", "Repository", "Candidate", "User", "Tenant"], roleAccess: "admin/super_admin" },
  { route: "/admin/runs/[id]", purpose: "Inspect one run trace, scores, evidence, and provider events.", files: ["src/app/admin/runs/[id]/page.tsx", "src/app/admin/runs/[id]/trace-event-list.tsx"], models: ["AnalysisRun", "AgentEvent", "SkillScore", "EvidenceFinding", "TerminalCommandRun"], roleAccess: "admin/super_admin" },
  { route: "/admin/tenants", purpose: "Tenant operations overview.", files: ["src/app/admin/tenants/page.tsx"], models: ["Tenant", "TenantMembership", "Cohort"], roleAccess: "admin/super_admin" },
  { route: "/admin/tenants/[id]", purpose: "Tenant detail and memberships.", files: ["src/app/admin/tenants/[id]/page.tsx"], models: ["Tenant", "TenantMembership", "User", "Cohort", "AnalysisRun"], roleAccess: "admin/super_admin" },
  { route: "/college/students/[id]", purpose: "Tenant-scoped student profile, runs, profiles, and skill trajectory.", files: ["src/app/college/students/[id]/page.tsx"], models: ["Candidate", "CohortStudent", "AnalysisRun", "Repository", "SkillScore", "PublicProfile"], roleAccess: "college_admin/college_member within tenant" },
  { route: "/college/cohorts/[id]", purpose: "Tenant-scoped cohort roster, invites, and student run summary.", files: ["src/app/college/cohorts/[id]/page.tsx", "src/app/college/cohorts/[id]/add-student-form.tsx"], models: ["Cohort", "CohortStudent", "Candidate", "AnalysisRun", "TenantInvite"], roleAccess: "college_admin/college_member within tenant" },
  { route: "/profile/[slug]", purpose: "Public/shared employer-safe profile page.", files: ["src/app/profile/[slug]/page.tsx"], models: ["PublicProfile", "AnalysisRun", "Candidate", "Repository", "SkillScore"], roleAccess: "public for public/unlisted links, owner/admin for private" },
  { route: "/admin/copilot", purpose: "Admin Intelligence Copilot console.", files: ["src/app/admin/copilot/page.tsx", "src/app/admin/copilot/copilot-console.tsx", "src/lib/copilot/*"], models: ["ChatSession", "ChatMessage", "ChatToolCall", "ChatActionApproval", "AuditLog"], roleAccess: "admin/super_admin" },
];

// --------------- tool definitions ---------------

const helpTools: ToolDef[] = [
  {
    name: "how_to_use",
    risk: "read",
    mode: "both",
    title: "How to use SkillProof AI",
    description: "Role-aware walkthrough of how to use SkillProof AI for the current user.",
    input: z.object({}).optional(),
    run: async (ctx) => buildHelpGuidance(ctx.user?.role ?? "anonymous"),
  },
  {
    name: "explain_topic",
    risk: "read",
    mode: "both",
    title: "Explain a topic",
    description:
      "Explain a SkillProof concept (verification steps, ownership proof, score meanings, not_measured, AI collaboration challenge, own-code interview, publishing, employer-safe reports, college dashboards) using project docs.",
    input: z.object({ query: z.string().min(2).max(400) }),
    run: async (_ctx, input) => {
      const hits = searchKnowledge(input.query, 4);
      return {
        query: input.query,
        snippets: hits.map((h) => ({
          source: h.title,
          path: h.path,
          heading: h.heading,
          text: redactDeep(h.text.slice(0, 800)),
        })),
      };
    },
  },
  {
    name: "explain_current_page",
    risk: "read",
    mode: "both",
    title: "Explain the current page",
    description: "Explain the purpose of the page the user is on and what they can do there.",
    input: z.object({ page: z.string().max(200).nullable().optional() }),
    run: async (ctx, input) => {
      const page = input.page ?? null;
      const match = page ? ROUTE_MAP.find((r) => page === r.route || page.startsWith(r.route + "/")) : null;
      return {
        page,
        purpose: match?.purpose ?? "General SkillProof AI page.",
        guidance: buildHelpGuidance(ctx.user?.role ?? "anonymous"),
      };
    },
  },
  {
    name: "guide_to_route",
    risk: "read",
    mode: "both",
    title: "Guide to a route",
    description: "Suggest which SkillProof route to visit for a stated goal.",
    input: z.object({ goal: z.string().min(2).max(300) }),
    run: async (ctx, input) => {
      const role = ctx.user?.role ?? "anonymous";
      const hits = searchKnowledge(input.goal, 2);
      const candidates = ROUTE_MAP.filter((r) => {
        if (role === "anonymous") return r.roles === "public";
        if (isAdminRole(role as any)) return true;
        return r.roles === "public" || role.startsWith(r.roles);
      });
      return { goal: input.goal, suggestedRoutes: candidates.slice(0, 4), references: hits.map((h) => h.path) };
    },
  },
  {
    name: "summarize_my_runs",
    risk: "read",
    mode: "help",
    title: "Summarize my runs",
    description: "Summarize ONLY the current signed-in user's own verification runs (status counts). No cross-user data.",
    input: z.object({}).optional(),
    run: async (ctx) => {
      if (!ctx.user) return { signedIn: false, runs: [] };
      const runs = await prisma.analysisRun.findMany({
        where: { createdByUserId: ctx.user.id },
        select: { id: true, status: true, targetRole: true, overallScore: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      return { signedIn: true, count: runs.length, runs: redactDeep(runs) };
    },
  },
];

const adminDataTools: ToolDef[] = [
  {
    name: "read_platform_overview",
    risk: "read",
    mode: "admin",
    title: "Read platform overview",
    description: "High-level counts and health: users, candidates, profiles, runs, tenants, cohorts, recent runs/profiles, and provider readiness.",
    input: z.object({}).optional(),
    run: async () => {
      const [usersByRole, candidateCount, profilesByVisibility, runsByStatus, tenantsByKind, cohortCount, recentRuns, recentProfiles, providers, health] =
        await Promise.all([
          prisma.user.groupBy({ by: ["role"], _count: { _all: true } } as any),
          prisma.candidate.count(),
          prisma.publicProfile.groupBy({ by: ["visibility"], _count: { _all: true } } as any),
          prisma.analysisRun.groupBy({ by: ["status"], _count: { _all: true } } as any),
          prisma.tenant.groupBy({ by: ["kind"], _count: { _all: true } } as any),
          prisma.cohort.count(),
          prisma.analysisRun.findMany({
            where: { status: { in: ["completed", "failed"] } },
            select: { id: true, status: true, targetRole: true, overallScore: true, lastFailureReason: true, completedAt: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 8,
          } as any),
          prisma.publicProfile.findMany({
            select: { id: true, slug: true, visibility: true, createdAt: true, candidate: { select: { name: true, email: true } } },
            orderBy: { createdAt: "desc" },
            take: 8,
          } as any),
          listProviderConfigs().catch(() => [] as any[]),
          listProviderHealth().catch(() => [] as any[]),
        ]);
      return adminDataResult({
        ok: true,
        detail: {
          usersByRole: Object.fromEntries((usersByRole as any[]).map((r) => [r.role, r._count._all])),
          candidatesCount: candidateCount,
          profilesByVisibility: Object.fromEntries((profilesByVisibility as any[]).map((r) => [r.visibility, r._count._all])),
          runsByStatus: Object.fromEntries((runsByStatus as any[]).map((r) => [r.status, r._count._all])),
          tenantsByKind: Object.fromEntries((tenantsByKind as any[]).map((r) => [r.kind, r._count._all])),
          cohortsCount: cohortCount,
          recentCompletedOrFailedRuns: recentRuns.map((r: any) => ({ ...r, route: `/admin/runs/${r.id}` })),
          recentCreatedProfiles: recentProfiles.map((p: any) => ({ ...p, route: `/profile/${p.slug}` })),
          providerReadiness: {
            configured: providers.length,
            enabled: providers.filter((p: any) => p.enabled).length,
            ready: health.filter((h: any) => h.status === "ready").length,
            rows: health.map((h: any) => ({ providerId: h.providerId, label: h.label, status: h.status, enabled: h.enabled, fix: h.fix })),
          },
        },
        routes: ["/admin/users", "/admin/profiles", "/admin/runs", "/admin/tenants", "/admin/providers/health"],
      });
    },
  },
  {
    name: "search_users_admin",
    risk: "read",
    mode: "admin",
    title: "Search users",
    description: "Search platform users by text, role, status, and tenant; returns admin-safe account, tenant, run, and profile counts.",
    input: z.object({
      q: z.string().max(200).optional(),
      role: z.string().max(60).optional(),
      status: z.string().max(60).optional(),
      tenantId: z.string().max(80).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    run: async (_ctx, input) => {
      const where: any = {};
      if (input.role) where.role = input.role;
      if (input.status) where.status = input.status;
      if (input.tenantId) where.OR = [{ primaryTenantId: input.tenantId }, { memberships: { some: { tenantId: input.tenantId } } }];
      if (input.q?.trim()) {
        where.AND = [
          ...(where.AND ?? []),
          {
            OR: [
              { email: { contains: input.q.trim() } },
              { name: { contains: input.q.trim() } },
              { githubUsername: { contains: input.q.trim() } },
            ],
          },
        ];
      }
      const rows = await prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limitOf(input, 25),
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          githubUsername: true,
          createdAt: true,
          primaryTenant: { select: { id: true, name: true, kind: true } },
          memberships: { select: { role: true, tenant: { select: { id: true, name: true, kind: true } } } },
          _count: { select: { runsCreated: true, profilesOwned: true } },
        },
      } as any);
      return adminDataResult({
        ok: true,
        query: input,
        count: rows.length,
        items: rows.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          githubUsername: u.githubUsername,
          primaryTenant: u.primaryTenant,
          memberships: u.memberships,
          runCount: u._count?.runsCreated ?? 0,
          profileCount: u._count?.profilesOwned ?? 0,
          createdAt: iso(u.createdAt),
          routes: [`/admin/users/${u.id}`],
        })),
      });
    },
  },
  {
    name: "search_candidates_admin",
    risk: "read",
    mode: "admin",
    title: "Search candidates",
    description: "Search students/candidates by text, profile/run presence, tenant/cohort, and minimum score.",
    input: z.object({
      q: z.string().max(200).optional(),
      hasProfile: z.boolean().optional(),
      hasCompletedRun: z.boolean().optional(),
      tenantId: z.string().max(80).optional(),
      cohortId: z.string().max(80).optional(),
      minScore: z.number().int().min(0).max(100).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    run: async (_ctx, input) => {
      const where: any = {};
      if (input.hasProfile === true) where.profiles = { some: {} };
      if (input.hasProfile === false) where.profiles = { none: {} };
      const runSome: any = {};
      if (input.hasCompletedRun) runSome.status = "completed";
      if (input.tenantId) runSome.tenantId = input.tenantId;
      if (typeof input.minScore === "number") runSome.overallScore = { gte: input.minScore };
      if (Object.keys(runSome).length) where.runs = { some: runSome };
      if (input.cohortId) where.cohortMemberships = { some: { cohortId: input.cohortId } };
      if (input.q?.trim()) {
        const q = input.q.trim();
        where.OR = [
          { name: { contains: q } },
          { email: { contains: q } },
          { githubUsername: { contains: q } },
          { user: { is: { email: { contains: q } } } },
          { repositories: { some: { repoName: { contains: q } } } },
          { repositories: { some: { owner: { contains: q } } } },
        ];
      }
      const rows = await prisma.candidate.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limitOf(input, 25),
        include: {
          user: { select: { id: true, email: true } },
          repositories: { select: { id: true, owner: true, repoName: true, repoUrl: true } },
          cohortMemberships: { include: { cohort: { include: { tenant: true } } } },
          profiles: { select: { id: true, slug: true, visibility: true, createdAt: true }, orderBy: { createdAt: "desc" } },
          runs: {
            orderBy: { createdAt: "desc" },
            include: {
              repository: true,
              scores: { select: { skillName: true, score: true, scoreSource: true } },
              profiles: { select: { id: true, slug: true, visibility: true, createdAt: true } },
            },
          },
        },
      } as any);
      return adminDataResult({ ok: true, query: input, count: rows.length, items: rows.map(candidateSummaryItem) });
    },
  },
  {
    name: "list_students_with_profiles",
    risk: "read",
    mode: "admin",
    title: "List students with profiles",
    description: "List students/candidates whose profiles have been created, including candidate, repo, score, run, profile, cohort, and route details.",
    input: z.object({
      visibility: z.enum(["public", "unlisted", "private", "any"]).optional(),
      tenantId: z.string().max(80).optional(),
      cohortId: z.string().max(80).optional(),
      q: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    run: async (_ctx, input) => {
      const where: any = {};
      if (input.visibility && input.visibility !== "any") where.visibility = input.visibility;
      if (input.tenantId) where.run = { tenantId: input.tenantId };
      if (input.cohortId) where.candidate = { is: { cohortMemberships: { some: { cohortId: input.cohortId } } } };
      if (input.q?.trim()) {
        const q = input.q.trim();
        where.OR = [
          { slug: { contains: q } },
          { candidate: { is: { name: { contains: q } } } },
          { candidate: { is: { email: { contains: q } } } },
          { candidate: { is: { githubUsername: { contains: q } } } },
          { owner: { is: { email: { contains: q } } } },
          { run: { is: { repository: { is: { repoName: { contains: q } } } } } },
        ];
      }
      const rows = await prisma.publicProfile.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limitOf(input, 25),
        include: {
          owner: { select: { id: true, email: true } },
          candidate: { include: { cohortMemberships: { include: { cohort: { include: { tenant: true } } } } } },
          run: {
            include: {
              tenant: true,
              candidate: true,
              repository: true,
              scores: { select: { skillName: true, score: true, scoreSource: true } },
            },
          },
        },
      } as any);
      return adminDataResult({
        ok: true,
        query: input,
        count: rows.length,
        items: rows.map(profileItem),
        routes: routeSet(rows.flatMap((p: any) => [`/profile/${p.slug}`, `/admin/runs/${p.runId}`, p.ownerUserId ? `/admin/users/${p.ownerUserId}` : null])),
        notes: rows.length ? [] : ["No matching profiles were found."],
      });
    },
  },
  {
    name: "get_student_profile_admin",
    risk: "read",
    mode: "admin",
    title: "Get student profile detail",
    description: "Deep admin-safe student/candidate detail by candidateId, email, GitHub username, or profile slug.",
    input: z.object({
      candidateId: z.string().max(80).optional(),
      email: z.string().max(200).optional(),
      githubUsername: z.string().max(120).optional(),
      profileSlug: z.string().max(160).optional(),
    }).refine((v) => !!(v.candidateId || v.email || v.githubUsername || v.profileSlug), {
      message: "Provide candidateId, email, githubUsername, or profileSlug.",
    }),
    run: async (_ctx, input) => {
      const where: any = input.candidateId
        ? { id: input.candidateId }
        : input.email
          ? { OR: [{ email: input.email }, { user: { is: { email: input.email } } }] }
          : input.githubUsername
            ? { OR: [{ githubUsername: input.githubUsername }, { user: { is: { githubUsername: input.githubUsername } } }] }
            : { profiles: { some: { slug: input.profileSlug } } };
      const row = await prisma.candidate.findFirst({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              status: true,
              githubUsername: true,
              primaryTenant: true,
              memberships: { include: { tenant: true } },
            },
          },
          cohortMemberships: { include: { cohort: { include: { tenant: true } } } },
          repositories: true,
          profiles: { orderBy: { createdAt: "desc" } },
          runs: {
            orderBy: { createdAt: "desc" },
            include: {
              tenant: true,
              repository: true,
              scores: { select: { skillName: true, score: true, scoreSource: true } },
              evidenceFindings: { select: { category: true } },
              questions: { select: { id: true, answer: true } },
              profiles: { select: { id: true, slug: true, visibility: true, createdAt: true } },
            },
          },
        },
      } as any);
      if (!row) return adminDataResult({ ok: true, query: input, count: 0, detail: null, notes: ["No matching student/candidate was found."] });
      const detail = studentDetail(row);
      return adminDataResult({ ok: true, query: input, count: 1, detail, routes: (detail as any).routes });
    },
  },
  {
    name: "list_profiles_admin",
    risk: "read",
    mode: "admin",
    title: "List profiles",
    description: "List public/unlisted/private profiles with candidate, owner, repository, role, score, and run details.",
    input: z.object({
      visibility: z.enum(["public", "unlisted", "private", "any"]).optional(),
      q: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    run: async (_ctx, input) => {
      const where: any = {};
      if (input.visibility && input.visibility !== "any") where.visibility = input.visibility;
      if (input.q?.trim()) {
        const q = input.q.trim();
        where.OR = [
          { slug: { contains: q } },
          { candidate: { is: { name: { contains: q } } } },
          { candidate: { is: { email: { contains: q } } } },
          { candidate: { is: { githubUsername: { contains: q } } } },
          { owner: { is: { email: { contains: q } } } },
        ];
      }
      const rows = await prisma.publicProfile.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limitOf(input, 25),
        include: {
          candidate: true,
          owner: { select: { id: true, email: true } },
          run: { include: { repository: true } },
        },
      } as any);
      return adminDataResult({
        ok: true,
        query: input,
        count: rows.length,
        items: rows.map((p: any) => ({
          profile: { id: p.id, slug: p.slug, visibility: p.visibility, createdAt: iso(p.createdAt), route: `/profile/${p.slug}` },
          candidate: p.candidate ? { name: p.candidate.name, email: p.candidate.email, githubUsername: p.candidate.githubUsername } : null,
          ownerEmail: p.owner?.email ?? null,
          run: { id: p.runId, targetRole: p.run?.targetRole ?? null, score: p.run?.overallScore ?? null, route: `/admin/runs/${p.runId}` },
          repository: p.run?.repository ? { owner: p.run.repository.owner, name: p.run.repository.repoName, fullName: repoName(p.run.repository) } : null,
          routes: routeSet([`/profile/${p.slug}`, `/admin/runs/${p.runId}`, p.owner?.id ? `/admin/users/${p.owner.id}` : null]),
        })),
      });
    },
  },
  {
    name: "get_profile_admin",
    risk: "read",
    mode: "admin",
    title: "Get profile detail",
    description: "Admin-safe detail for one profile by id or slug, including publish-gate blockers.",
    input: z.object({ profileId: z.string().max(80).optional(), slug: z.string().max(160).optional() }).refine((v) => !!(v.profileId || v.slug), {
      message: "Provide profileId or slug.",
    }),
    run: async (_ctx, input) => {
      const row: any = await prisma.publicProfile.findFirst({
        where: input.profileId ? { id: input.profileId } : { slug: input.slug },
        include: {
          candidate: true,
          owner: { select: { id: true, email: true, name: true } },
          run: { include: { repository: true, scores: { select: { skillName: true, score: true, scoreSource: true } }, evidenceFindings: { select: { category: true, publicSafe: true, employerSafe: true, candidateSafe: true } } } },
        },
      } as any);
      if (!row) return adminDataResult({ ok: true, query: input, count: 0, detail: null, notes: ["No matching profile was found."] });
      const blockers = getPublicProfilePublishBlockers(row.run as any);
      return adminDataResult({
        ok: true,
        query: input,
        count: 1,
        detail: {
          profile: { id: row.id, slug: row.slug, visibility: row.visibility, createdAt: iso(row.createdAt), route: `/profile/${row.slug}` },
          candidate: row.candidate ? { id: row.candidate.id, name: row.candidate.name, email: row.candidate.email, githubUsername: row.candidate.githubUsername } : null,
          owner: row.owner,
          run: { id: row.runId, status: row.run.status, targetRole: row.run.targetRole, score: row.run.overallScore, verificationLevel: row.run.verificationLevel, route: `/admin/runs/${row.runId}` },
          repository: row.run.repository ? { owner: row.run.repository.owner, name: row.run.repository.repoName, url: row.run.repository.repoUrl } : null,
          scores: row.run.scores,
          safeEvidenceSummary: {
            byCategory: evidenceCategoryCounts(row.run.evidenceFindings ?? []),
            publicSafeCount: (row.run.evidenceFindings ?? []).filter((e: any) => e.publicSafe).length,
            employerSafeCount: (row.run.evidenceFindings ?? []).filter((e: any) => e.employerSafe).length,
          },
          publishGateBlockers: blockers,
        },
        routes: [`/profile/${row.slug}`, `/admin/runs/${row.runId}`],
      });
    },
  },
  {
    name: "read_cohorts_admin",
    risk: "read",
    mode: "admin",
    title: "Read cohorts",
    description: "List cohorts with tenant, student count, invite count, and readiness stats derived from student runs.",
    input: z.object({ tenantId: z.string().max(80).optional(), q: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional() }),
    run: async (_ctx, input) => {
      const where: any = {};
      if (input.tenantId) where.tenantId = input.tenantId;
      if (input.q?.trim()) where.name = { contains: input.q.trim() };
      const rows = await prisma.cohort.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limitOf(input, 25),
        include: {
          tenant: true,
          invites: { select: { id: true } },
          students: { include: { candidate: { include: { runs: { select: { overallScore: true, status: true } } } } } },
        },
      } as any);
      return adminDataResult({
        ok: true,
        query: input,
        count: rows.length,
        items: rows.map((c: any) => {
          const bestScores = (c.students ?? []).map((s: any) => Math.max(0, ...(s.candidate?.runs ?? []).map((r: any) => r.overallScore ?? 0)));
          return {
            id: c.id,
            name: c.name,
            year: c.year,
            tenant: c.tenant ? { id: c.tenant.id, name: c.tenant.name, kind: c.tenant.kind } : null,
            studentCount: c.students?.length ?? 0,
            inviteCount: c.invites?.length ?? 0,
            readiness: {
              score70Plus: bestScores.filter((s: number) => s >= 70).length,
              averageBestScore: bestScores.length ? Math.round(bestScores.reduce((a: number, b: number) => a + b, 0) / bestScores.length) : null,
            },
            routes: [`/college/cohorts/${c.id}`, `/admin/tenants/${c.tenantId}`],
          };
        }),
      });
    },
  },
  {
    name: "read_cohort_students_admin",
    risk: "read",
    mode: "admin",
    title: "Read cohort students",
    description: "Read one cohort and its students with latest run, best score, profiles, and skill gaps.",
    input: z.object({ cohortId: z.string().min(2).max(80) }),
    run: async (_ctx, input) => {
      const cohort: any = await prisma.cohort.findUnique({
        where: { id: input.cohortId },
        include: {
          tenant: true,
          students: {
            include: {
              candidate: {
                include: {
                  profiles: { select: { id: true, slug: true, visibility: true, createdAt: true } },
                  runs: {
                    orderBy: { createdAt: "desc" },
                    include: { repository: true, scores: { select: { skillName: true, score: true, scoreSource: true } } },
                  },
                },
              },
            },
          },
        },
      } as any);
      if (!cohort) return adminDataResult({ ok: true, query: input, count: 0, detail: null, notes: ["No matching cohort was found."] });
      return adminDataResult({
        ok: true,
        query: input,
        count: cohort.students?.length ?? 0,
        detail: {
          cohort: { id: cohort.id, name: cohort.name, year: cohort.year, tenant: cohort.tenant },
          students: (cohort.students ?? []).map((row: any) => {
            const candidate = row.candidate;
            const runs = sortRunsDesc(candidate.runs ?? []);
            const latest = runs[0] ?? null;
            const bestScore = Math.max(0, ...runs.map((r: any) => r.overallScore ?? 0));
            const summary = scoreSummary(scoresFromRuns(runs));
            return {
              candidate: { id: candidate.id, name: candidate.name, email: candidate.email, githubUsername: candidate.githubUsername },
              latestRun: latest ? { id: latest.id, status: latest.status, score: latest.overallScore, repository: repoName(latest.repository), route: `/admin/runs/${latest.id}` } : null,
              bestScore: bestScore || null,
              profiles: (candidate.profiles ?? []).map((p: any) => ({ id: p.id, slug: p.slug, visibility: p.visibility, route: `/profile/${p.slug}` })),
              skillGaps: summary.weakest,
              routes: routeSet([`/college/students/${candidate.id}`, latest?.id ? `/admin/runs/${latest.id}` : null, ...(candidate.profiles ?? []).map((p: any) => `/profile/${p.slug}`)]),
            };
          }),
        },
        routes: [`/college/cohorts/${cohort.id}`],
      });
    },
  },
  {
    name: "explain_data_model",
    risk: "read",
    mode: "admin",
    title: "Explain data model",
    description: "Deterministic explanation of Prisma models and where each kind of platform data is stored.",
    input: z.object({ topic: z.string().max(200).optional() }),
    run: async (_ctx, input) => {
      const topic = input.topic?.toLowerCase().trim();
      const entries = Object.entries(DATA_MODEL_EXPLANATION)
        .filter(([name, text]) => !topic || `${name} ${text}`.toLowerCase().includes(topic))
        .map(([model, explanation]) => ({ model, explanation }));
      return adminDataResult({
        ok: true,
        query: input,
        count: entries.length,
        items: entries,
        notes: ["Source of truth: prisma/schema.prisma. This explanation is deterministic and does not inspect secrets."],
        routes: ["/admin/users", "/admin/profiles", "/admin/runs", "/admin/tenants"],
      });
    },
  },
  {
    name: "explain_project_architecture",
    risk: "read",
    mode: "admin",
    title: "Explain project architecture",
    description: "Deterministic explanation of roles, routes, workflow, provider system, agent pipeline, worker mode, evidence, publishing, admin surfaces, and copilot security.",
    input: z.object({ topic: z.string().max(200).optional() }),
    run: async (_ctx, input) => {
      const topic = input.topic?.toLowerCase().trim();
      const entries = Object.entries(PROJECT_ARCHITECTURE_EXPLANATION)
        .filter(([name, text]) => !topic || `${name} ${text}`.toLowerCase().includes(topic))
        .map(([area, explanation]) => ({ area, explanation }));
      return adminDataResult({
        ok: true,
        query: input,
        count: entries.length,
        items: entries,
        notes: ["Source files: docs/ARCHITECTURE.md, README.md, src/app routes, src/lib/providers, src/agents, src/lib/copilot."],
        routes: ["/admin/copilot", "/admin/runs", "/admin/providers/health", "/profile/[slug]"],
      });
    },
  },
  {
    name: "explain_route_or_feature",
    risk: "read",
    mode: "admin",
    title: "Explain route or feature",
    description: "Map an admin question to matching routes, source files, models, likely Prisma queries, and role access.",
    input: z.object({ query: z.string().min(2).max(300) }),
    run: async (_ctx, input) => {
      const q = input.query.toLowerCase();
      const matches = ROUTE_FEATURES.filter((r) => `${r.route} ${r.purpose} ${r.files.join(" ")} ${r.models.join(" ")}`.toLowerCase().includes(q)).slice(0, 8);
      const fallback = matches.length ? matches : ROUTE_FEATURES.filter((r) => q.split(/\s+/).some((part: string) => part.length > 3 && `${r.route} ${r.purpose}`.toLowerCase().includes(part))).slice(0, 8);
      return adminDataResult({
        ok: true,
        query: input,
        count: fallback.length,
        items: fallback.map((r) => ({
          ...r,
          likelyPrismaQueries: r.models.map((m) => `prisma.${m[0].toLowerCase()}${m.slice(1)}.* via typed Prisma Client`),
        })),
        routes: fallback.map((r) => r.route),
        notes: fallback.length ? [] : ["No direct route match was found. Try a route path, model name, or feature keyword."],
      });
    },
  },
];

const adminReadTools: ToolDef[] = [
  {
    name: "read_provider_health",
    risk: "read",
    mode: "admin",
    title: "Read provider health",
    description: "Current health of every provider (installed/authenticated/JSON support), redacted.",
    input: z.object({}).optional(),
    run: async () => {
      const health = await listProviderHealth();
      return redactDeep(
        health.map((h) => ({
          providerId: h.providerId,
          label: h.label,
          status: h.status,
          enabled: h.enabled,
          installed: h.installed,
          authenticated: h.authenticated,
          configuredModel: h.configuredModel,
          supportsJson: h.supportsJson,
          fix: h.fix,
        })),
      );
    },
  },
  {
    name: "read_provider_configs",
    risk: "read",
    mode: "admin",
    title: "Read provider configs",
    description: "Provider registry rows. API key ENV NAMES only — never key values.",
    input: z.object({}).optional(),
    run: async () => {
      const rows = await listProviderConfigs();
      return redactDeep(
        rows.map((p: any) => ({
          providerId: p.providerId,
          label: p.label,
          kind: p.kind,
          enabled: p.enabled,
          defaultModel: p.defaultModel,
          baseUrl: p.baseUrl,
          command: p.command,
          apiKeyEnv: p.apiKeyEnv,
          lastTestStatus: p.lastTestStatus,
          lastTestJsonOk: p.lastTestJsonOk,
          lastTestedAt: p.lastTestedAt,
        })),
      );
    },
  },
  {
    name: "read_agent_configs",
    risk: "read",
    mode: "admin",
    title: "Read agent configs",
    description: "Per-agent provider/model/reasoning/enabled rows.",
    input: z.object({}).optional(),
    run: async () => {
      const rows = await listAgentConfigs();
      return redactDeep(
        rows.map((a: any) => ({
          agentName: a.agentName,
          providerId: a.providerId,
          model: a.model,
          reasoningBudget: a.reasoningBudget,
          enabled: a.enabled,
          fallbackProvider: a.fallbackProvider,
          fallbackStrategy: a.fallbackStrategy,
        })),
      );
    },
  },
  {
    name: "read_run_status",
    risk: "read",
    mode: "admin",
    title: "Read run status",
    description: "Status, score, and verification level for one AnalysisRun.",
    input: z.object({ runId: z.string().min(2).max(60) }),
    run: async (_ctx, input) => {
      const run = await prisma.analysisRun.findUnique({
        where: { id: input.runId },
        select: {
          id: true, status: true, statusMessage: true, overallScore: true, roleFit: true,
          verificationLevel: true, executionMode: true, lastFailureReason: true, createdAt: true, completedAt: true,
        },
      });
      if (!run) return { found: false };
      return { found: true, run: redactDeep(run) };
    },
  },
  {
    name: "read_failed_runs",
    risk: "read",
    mode: "admin",
    title: "Read failed runs",
    description: "Recent failed runs with their failure reasons.",
    input: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    run: async (_ctx, input) => {
      const runs = await prisma.analysisRun.findMany({
        where: { status: "failed" },
        select: { id: true, statusMessage: true, lastFailureReason: true, executionMode: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: input?.limit ?? 10,
      });
      return redactDeep(runs);
    },
  },
  {
    name: "read_run_evidence_summary",
    risk: "read",
    mode: "admin",
    title: "Read run evidence summary",
    description: "Admin-safe evidence findings for a run (redacted text + command summaries only, never raw logs).",
    input: z.object({ runId: z.string().min(2).max(60) }),
    run: async (_ctx, input) => {
      const findings = await prisma.evidenceFinding.findMany({
        where: { runId: input.runId },
        select: { id: true, category: true, claim: true, evidenceType: true, filePath: true, confidence: true, severity: true, redactedText: true },
        orderBy: { confidence: "desc" },
        take: 50,
      });
      return redactDeep(findings.map((f) => ({ ...f, redactedText: (f.redactedText || "").slice(0, 400) })));
    },
  },
  {
    name: "explain_publish_gate_failure",
    risk: "read",
    mode: "admin",
    title: "Explain publish-gate failure",
    description: "Why a run's public profile is blocked from publishing (trust-gate blockers).",
    input: z.object({ runId: z.string().min(2).max(60) }),
    run: async (_ctx, input) => {
      const run = await prisma.analysisRun.findUnique({
        where: { id: input.runId },
        select: {
          status: true, statusMessage: true, executionMode: true, providerMatrix: true,
          validationSummary: true, profileSummary: true, employerVerifier: true, ownershipStatus: true,
          scores: { select: { skillName: true, score: true, scoreSource: true, evidence: true } },
        },
      });
      if (!run) return { found: false };
      const blockers = getPublicProfilePublishBlockers(run as any);
      return { found: true, publishable: blockers.length === 0, blockers: redactDeep(blockers) };
    },
  },
  {
    name: "read_prompt_versions",
    risk: "read",
    mode: "admin",
    title: "Read prompt versions",
    description: "Prompt versions, optionally for one agent.",
    input: z.object({ agentName: z.string().max(60).optional() }),
    run: async (_ctx, input) => {
      const versions = await listPromptVersions(input?.agentName);
      return redactDeep(
        versions.map((v: any) => ({ id: v.id, agentName: v.agentName, version: v.version, isActive: v.isActive, createdAt: v.createdAt })),
      );
    },
  },
  {
    name: "read_rubric_config",
    risk: "read",
    mode: "admin",
    title: "Read rubric config",
    description: "Active scoring/rubric prompt for an evaluator agent (default: validator).",
    input: z.object({ agentName: z.string().max(60).optional() }),
    run: async (_ctx, input) => {
      const agentName = input?.agentName ?? "validator";
      const active = await getActivePrompt(agentName);
      if (!active) return { agentName, hasActiveRubric: false };
      return {
        agentName,
        hasActiveRubric: true,
        version: active.version,
        systemPreview: redactDeep(active.system.slice(0, 600)),
      };
    },
  },
  {
    name: "read_audit_logs",
    risk: "read",
    mode: "admin",
    title: "Read audit logs",
    description: "Recent audit-log entries (redacted).",
    input: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    run: async (_ctx, input) => {
      const logs = await prisma.auditLog.findMany({
        select: { id: true, action: true, actorUserId: true, targetType: true, targetId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: input?.limit ?? 20,
      });
      return redactDeep(logs);
    },
  },
  {
    name: "read_demo_checklist",
    risk: "read",
    mode: "admin",
    title: "Read demo checklist",
    description: "The judge/demo readiness checklist.",
    input: z.object({}).optional(),
    run: async () => ({
      checklist: [
        "At least one provider passes the JSON contract test (Admin → Providers → Health).",
        "Every enabled agent points at a ready provider (Admin → Agents).",
        "Active prompt versions exist for evaluator agents.",
        "A completed real run exists with evidence-backed scores.",
        "A published employer-safe profile is reachable.",
        "Audit log shows recent admin actions.",
      ],
    }),
  },
  {
    name: "generate_setup_diagnostics",
    risk: "read",
    mode: "admin",
    title: "Generate setup diagnostics",
    description: "Diagnose provider readiness and recommend fixes.",
    input: z.object({ mode: z.enum(["api", "cli", "hybrid", "local"]).optional() }),
    run: async (_ctx, input) => {
      const readiness = await checkProviderReadinessForMode(input?.mode ?? "api");
      return redactDeep({
        mode: readiness.mode,
        ok: readiness.ok,
        blockers: readiness.blockers,
        recommendation: readiness.ok
          ? "Providers are ready. You can start verifications."
          : "Resolve the blockers above in Admin → Providers → Health, then re-run diagnostics.",
      });
    },
  },
  {
    name: "summarize_public_safe_profile",
    risk: "read",
    mode: "admin",
    title: "Summarize profile (public-safe)",
    description: "Public-safe summary of a run's profile — no admin traces.",
    input: z.object({ runId: z.string().min(2).max(60) }),
    run: async (_ctx, input) => {
      const run = await prisma.analysisRun.findUnique({
        where: { id: input.runId },
        select: { id: true, overallScore: true, roleFit: true, verificationLevel: true, profileSummary: true },
      });
      if (!run) return { found: false };
      return {
        found: true,
        mode: "public_safe",
        summary: redactDeep({
          overallScore: run.overallScore,
          roleFit: run.roleFit,
          verificationLevel: run.verificationLevel,
          profileSummary: run.profileSummary ? JSON.parse(run.profileSummary) : null,
        }),
      };
    },
  },
  {
    name: "summarize_admin_run_report",
    risk: "read",
    mode: "admin",
    title: "Summarize run report (admin-safe)",
    description: "Admin-safe run report: status, scores, evidence counts (redacted).",
    input: z.object({ runId: z.string().min(2).max(60) }),
    run: async (_ctx, input) => {
      const run = await prisma.analysisRun.findUnique({
        where: { id: input.runId },
        select: {
          id: true, status: true, overallScore: true, verificationLevel: true, executionMode: true,
          scores: { select: { skillName: true, score: true, scoreSource: true } },
          _count: { select: { evidenceFindings: true } },
        },
      });
      if (!run) return { found: false };
      return { found: true, mode: "admin_safe", report: redactDeep(run) };
    },
  },
];

const adminWriteTools: ToolDef[] = [
  {
    name: "update_agent_config",
    risk: "write_safe",
    mode: "admin",
    title: "Update one agent config",
    description: "Change provider/model/reasoning/enabled for a single agent.",
    input: z.object({
      agentName: z.string().min(2).max(60),
      providerId: z.string().min(2).max(40).optional(),
      model: z.string().min(1).max(120).optional(),
      reasoningBudget: z.enum(["none", "low", "medium", "high", "max"]).optional(),
      enabled: z.boolean().optional(),
    }),
    plan: async (_ctx, input) => {
      const existing = await getAgentConfig(input.agentName);
      if (!existing) throw new ToolPreconditionError({ code: "agent_not_found", message: `Agent '${input.agentName}' not found.`, fix: "Use a known agent name from read_agent_configs." });
      const patch = pick(input, ["providerId", "model", "reasoningBudget", "enabled"]);
      return {
        intent: `Update agent '${input.agentName}'.`,
        affected: [input.agentName],
        before: pick(existing as any, Object.keys(patch)),
        after: patch,
        risks: ["Changes which provider/model scores this agent's skills on the next run."],
        rollback: "Re-apply the previous values shown under 'before'.",
      };
    },
    apply: async (_ctx, input) => {
      const patch = pick(input, ["providerId", "model", "reasoningBudget", "enabled"]);
      const updated = await updateAgentConfig(input.agentName, patch as any);
      invalidateProviderRegistryCache();
      return { agentName: input.agentName, updated: pick(updated as any, Object.keys(patch)) };
    },
  },
  {
    name: "set_agent_enabled",
    risk: "write_sensitive",
    mode: "admin",
    title: "Enable/disable an agent",
    description: "Enable or disable an optional agent.",
    input: z.object({ agentName: z.string().min(2).max(60), enabled: z.boolean() }),
    plan: async (_ctx, input) => {
      const existing = await getAgentConfig(input.agentName);
      if (!existing) throw new ToolPreconditionError({ code: "agent_not_found", message: `Agent '${input.agentName}' not found.`, fix: "Use a known agent name." });
      return {
        intent: `${input.enabled ? "Enable" : "Disable"} agent '${input.agentName}'.`,
        affected: [input.agentName],
        before: { enabled: (existing as any).enabled },
        after: { enabled: input.enabled },
        risks: input.enabled ? ["Agent will run and require a ready provider."] : ["Disabling a required agent can break verification runs."],
        rollback: `Set enabled back to ${(existing as any).enabled}.`,
      };
    },
    apply: async (_ctx, input) => {
      const updated = await updateAgentConfig(input.agentName, { enabled: input.enabled });
      invalidateProviderRegistryCache();
      return { agentName: input.agentName, enabled: (updated as any).enabled };
    },
  },
  {
    name: "update_provider_config",
    risk: "write_sensitive",
    mode: "admin",
    title: "Update provider config",
    description: "Change a provider's enabled flag, default model, base URL, or command.",
    input: z.object({
      providerId: z.string().min(2).max(40),
      enabled: z.boolean().optional(),
      defaultModel: z.string().max(120).nullable().optional(),
      baseUrl: z.string().max(300).nullable().optional(),
      command: z.string().max(200).nullable().optional(),
    }),
    plan: async (_ctx, input) => {
      const rows = await listProviderConfigs();
      const existing = rows.find((r: any) => r.providerId === input.providerId);
      if (!existing) throw new ToolPreconditionError({ code: "provider_not_found", message: `Provider '${input.providerId}' not found.`, fix: "Use a known provider id." });
      const patch = pick(input, ["enabled", "defaultModel", "baseUrl", "command"]);
      return {
        intent: `Update provider '${input.providerId}'.`,
        affected: [input.providerId],
        before: pick(existing as any, Object.keys(patch)),
        after: patch,
        risks: ["May change which providers are available for verification runs."],
        rollback: "Re-apply the previous values shown under 'before'.",
      };
    },
    apply: async (_ctx, input) => {
      const patch = pick(input, ["enabled", "defaultModel", "baseUrl", "command"]);
      const updated = await updateProviderConfig(input.providerId, patch as any);
      invalidateProviderRegistryCache();
      return { providerId: input.providerId, updated: pick(updated as any, Object.keys(patch)) };
    },
  },
  {
    name: "bulk_set_agent_provider",
    risk: "write_sensitive",
    mode: "admin",
    title: "Set one provider/model for all agents",
    description:
      "Point every ENABLED agent at one provider (e.g. Claude CLI). Fails closed if the target provider is not healthy.",
    input: z.object({
      providerId: z.string().min(2).max(40),
      model: z.string().min(1).max(120).optional(),
    }),
    plan: async (_ctx, input) => {
      // Fail closed: target provider must pass the same health policy as the pipeline.
      await assertProviderHealthy(input.providerId);
      const [rows, agents] = await Promise.all([listProviderConfigs(), listAgentConfigs()]);
      const enabledAgents = (agents as any[]).filter((a) => a.enabled);
      const model = modelForBulk(input.providerId, input.model, rows as any[]);
      const reasoningBudget = reasoningSupportedByProvider(input.providerId as any) ? undefined : "none";
      return {
        intent: `Set provider '${input.providerId}' (model '${model}') for all ${enabledAgents.length} enabled agents.`,
        affected: enabledAgents.map((a) => a.agentName),
        before: enabledAgents.map((a) => ({ agentName: a.agentName, providerId: a.providerId, model: a.model })),
        after: enabledAgents.map((a) => ({
          agentName: a.agentName,
          providerId: input.providerId,
          model,
          ...(reasoningBudget ? { reasoningBudget } : {}),
        })),
        risks: [
          "Overrides the per-agent provider matrix for every enabled agent.",
          "If the target provider degrades, all agents are affected at once.",
        ],
        rollback: "Re-apply each agent's previous provider/model from the 'before' list.",
      };
    },
    apply: async (_ctx, input) => {
      await assertProviderHealthy(input.providerId); // re-check at execution time
      const [rows, agents] = await Promise.all([listProviderConfigs(), listAgentConfigs()]);
      const enabledAgents = (agents as any[]).filter((a) => a.enabled);
      const model = modelForBulk(input.providerId, input.model, rows as any[]);
      const reasoningBudget = reasoningSupportedByProvider(input.providerId as any) ? undefined : ("none" as const);
      const affected: Array<{ agentName: string; providerId: string; model: string }> = [];
      for (const a of enabledAgents) {
        await updateAgentConfig(a.agentName, {
          providerId: input.providerId,
          model,
          ...(reasoningBudget ? { reasoningBudget } : {}),
        } as any);
        affected.push({ agentName: a.agentName, providerId: input.providerId, model });
      }
      invalidateProviderRegistryCache();
      return { affectedCount: affected.length, providerId: input.providerId, model, agents: affected };
    },
  },
  {
    name: "create_prompt_version",
    risk: "write_safe",
    mode: "admin",
    title: "Create prompt version",
    description: "Create a new prompt version for an agent (optionally activate it).",
    input: z.object({
      agentName: z.string().min(2).max(60),
      system: z.string().min(1).max(10000),
      instructions: z.string().max(10000).nullable().optional(),
      activate: z.boolean().optional(),
    }),
    plan: async (_ctx, input) => ({
      intent: `Create a new prompt version for '${input.agentName}'${input.activate ? " and activate it" : ""}.`,
      affected: [input.agentName],
      before: { note: "A new version is appended; existing versions are unchanged." },
      after: { agentName: input.agentName, activate: !!input.activate, systemPreview: input.system.slice(0, 200) },
      risks: input.activate ? ["Activating immediately changes how this agent is prompted on the next run."] : [],
      rollback: "Re-activate the previously active version (activate_prompt_version).",
    }),
    apply: async (ctx, input) => {
      const created = await createPromptVersion({
        agentName: input.agentName,
        system: input.system,
        instructions: input.instructions ?? null,
        activate: !!input.activate,
        createdById: ctx.user?.id ?? null,
      });
      return { id: created.id, agentName: created.agentName, version: created.version, isActive: created.isActive };
    },
  },
  {
    name: "activate_prompt_version",
    risk: "write_safe",
    mode: "admin",
    title: "Activate prompt version",
    description: "Activate a specific prompt version by id.",
    input: z.object({ id: z.string().min(2).max(60) }),
    plan: async (_ctx, input) => ({
      intent: `Activate prompt version '${input.id}'.`,
      affected: [input.id],
      before: { note: "The currently active version for this agent will be deactivated." },
      after: { activeVersionId: input.id },
      risks: ["Changes how the agent is prompted on the next run."],
      rollback: "Activate the previous version id.",
    }),
    apply: async (_ctx, input) => {
      const activated = await activatePromptVersion(input.id);
      return { id: activated.id, agentName: activated.agentName, version: activated.version, isActive: activated.isActive };
    },
  },
  {
    name: "purge_old_audit_logs",
    risk: "destructive",
    mode: "admin",
    title: "Purge old audit logs",
    description: "Permanently delete audit-log entries older than N days.",
    input: z.object({ olderThanDays: z.number().int().min(30).max(3650) }),
    plan: async (_ctx, input) => {
      const cutoff = new Date(Date.now() - input.olderThanDays * 86_400_000);
      const count = await prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } });
      return {
        intent: `Permanently delete ${count} audit-log entries older than ${input.olderThanDays} days.`,
        affected: [`${count} AuditLog rows before ${cutoff.toISOString()}`],
        before: { matchingRows: count },
        after: { matchingRows: 0 },
        risks: ["Audit history is permanently lost and cannot be recovered."],
        rollback: "None — restore from a database backup if needed.",
      };
    },
    apply: async (_ctx, input) => {
      const cutoff = new Date(Date.now() - input.olderThanDays * 86_400_000);
      const res = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
      return { deleted: res.count, cutoff: cutoff.toISOString() };
    },
  },
];

// Forbidden tools: present so the policy layer can explicitly refuse them if the
// model (or a prompt injection) ever names one. They have no handlers and never
// execute.
const forbiddenTools: ToolDef[] = [
  { name: "bypass_publish_gate", risk: "forbidden", mode: "admin", title: "Bypass publish gate", description: "Refused: trust gates cannot be bypassed.", input: z.any() },
  { name: "fabricate_evidence", risk: "forbidden", mode: "admin", title: "Fabricate evidence", description: "Refused: evidence cannot be fabricated.", input: z.any() },
  { name: "fabricate_score", risk: "forbidden", mode: "admin", title: "Fabricate score", description: "Refused: scores cannot be fabricated.", input: z.any() },
  { name: "reveal_secrets", risk: "forbidden", mode: "admin", title: "Reveal secrets", description: "Refused: secrets/.env/keys are never exposed.", input: z.any() },
  { name: "run_arbitrary_sql", risk: "forbidden", mode: "admin", title: "Run arbitrary SQL", description: "Refused: arbitrary SQL is not permitted.", input: z.any() },
  { name: "run_arbitrary_shell", risk: "forbidden", mode: "admin", title: "Run arbitrary shell", description: "Refused: arbitrary shell execution is not permitted.", input: z.any() },
];

export const TOOLS: ToolDef[] = [...helpTools, ...adminDataTools, ...adminReadTools, ...adminWriteTools, ...forbiddenTools];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ToolDef | undefined {
  return TOOL_BY_NAME.get(name);
}

/** Tools the assistant may be told about (advertised) for a given mode/role. Excludes forbidden. */
export function listTools(mode: "help" | "admin", role: SessionUser["role"] | "anonymous"): ToolDef[] {
  return TOOLS.filter((t) => {
    if (t.risk === "forbidden") return false;
    const modeOk = t.mode === "both" || t.mode === mode;
    if (!modeOk) return false;
    if (mode === "admin") return isAdminRole(role as any);
    return true; // help tools available to anyone (handlers self-scope to the user)
  });
}

export type ToolPermission =
  | { allowed: true; tool: ToolDef }
  | { allowed: false; reason: "unknown_tool" | "forbidden" | "mode_mismatch" | "forbidden_role"; tool?: ToolDef };

/**
 * Resolve whether a tool may be invoked in this context. This is the security
 * boundary: it depends ONLY on the registry + the server-trusted session role,
 * never on the user's message. Prompt injection therefore cannot widen it.
 */
export function resolveToolPermission(toolName: string, ctx: ToolContext): ToolPermission {
  const tool = getTool(toolName);
  if (!tool) return { allowed: false, reason: "unknown_tool" };
  if (tool.risk === "forbidden") return { allowed: false, reason: "forbidden", tool };

  const modeOk = tool.mode === "both" || tool.mode === ctx.mode;
  if (!modeOk) return { allowed: false, reason: "mode_mismatch", tool };

  const needsAdmin = tool.mode === "admin" || ctx.mode === "admin";
  if (needsAdmin && !(ctx.user && isAdminRole(ctx.user.role))) {
    return { allowed: false, reason: "forbidden_role", tool };
  }
  return { allowed: true, tool };
}

export function toolManifest(mode: "help" | "admin", role: SessionUser["role"] | "anonymous") {
  return listTools(mode, role).map((t) => ({
    name: t.name,
    risk: t.risk,
    title: t.title,
    description: t.description,
  }));
}
