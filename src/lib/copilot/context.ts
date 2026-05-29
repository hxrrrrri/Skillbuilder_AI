// Project-aware context the copilot is given on every turn.
//
// `help` mode receives only public, role-appropriate product knowledge plus the
// current user's own visible summary. `admin` mode additionally receives a
// redacted snapshot of the provider/agent registry and readiness. Nothing here
// is allowed to carry raw secrets — everything DB- or env-derived passes through
// redactDeep first.

import type { Role } from "@/lib/auth/roles";
import { isAdminRole } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { redactDeep } from "./redaction";

export type CopilotMode = "help" | "admin";

export const PRODUCT_SUMMARY = `SkillProof AI is a proof-of-work hiring platform. Candidates connect a real GitHub
repository; a mission of evaluator agents verifies skill from actual code, git history, tests, and
terminal proof rather than self-reported claims. Every score must cite evidence; anything that cannot be
evidenced is reported as "not_measured" rather than guessed. Verified results become an employer-safe
public profile. Roles: candidate (prove skill), employer (search/compare/interview), college (cohort
readiness & skill gaps), admin (operate providers, agents, prompts, runs, evidence, audit).`;

export const ROUTE_MAP: Array<{ route: string; purpose: string; roles: string }> = [
  { route: "/", purpose: "Marketing + start a verification", roles: "public" },
  { route: "/candidate/dashboard", purpose: "Start runs, prove ownership, interview, publish", roles: "candidate" },
  { route: "/employer/dashboard", purpose: "Search, compare, shortlist, interview kits", roles: "employer" },
  { route: "/college/dashboard", purpose: "Cohorts, readiness, skill gaps, employer share", roles: "college" },
  { route: "/admin/dashboard", purpose: "Operations overview", roles: "admin" },
  { route: "/admin/providers", purpose: "Provider configs", roles: "admin" },
  { route: "/admin/providers/health", purpose: "Provider health + JSON contract tests", roles: "admin" },
  { route: "/admin/agents", purpose: "Per-agent provider/model/reasoning", roles: "admin" },
  { route: "/admin/prompts", purpose: "Prompt versions (create/activate)", roles: "admin" },
  { route: "/admin/runs", purpose: "Inspect runs, failures, evidence", roles: "admin" },
  { route: "/admin/profiles", purpose: "Moderate profile visibility and inspect profile-linked candidates/runs", roles: "admin" },
  { route: "/admin/users", purpose: "Search all users by role/status/tenant", roles: "admin" },
  { route: "/admin/users/[id]", purpose: "Inspect one user with memberships, runs, and profiles", roles: "admin" },
  { route: "/admin/tenants", purpose: "Manage tenant records", roles: "admin" },
  { route: "/admin/tenants/[id]", purpose: "Inspect one tenant, memberships, cohorts, and scoped activity", roles: "admin" },
  { route: "/admin/evidence", purpose: "Evidence findings", roles: "admin" },
  { route: "/admin/audit-logs", purpose: "Audit trail", roles: "admin" },
  { route: "/admin/copilot", purpose: "Command Copilot (this assistant)", roles: "admin" },
  { route: "/college/students/[id]", purpose: "Tenant-scoped student detail with runs, profiles, skill trajectory, and improvement plan", roles: "college" },
  { route: "/college/cohorts/[id]", purpose: "Tenant-scoped cohort roster, invites, student runs, and best scores", roles: "college" },
  { route: "/profile/[slug]", purpose: "Public/shared/private profile page backed by PublicProfile and AnalysisRun", roles: "public" },
];

export const SCHEMA_SUMMARY = `SkillProof data dictionary:
- User: account, RBAC role, status, optional githubUsername, primaryTenantId, tenant memberships, created runs, and owned PublicProfiles. passwordHash/session/account tokens are never exposed.
- Candidate: student/candidate identity; optionally linked one-to-one to User; owns Repository, AnalysisRun, PublicProfile, CohortStudent, and reverification rows.
- Repository: candidate GitHub repository metadata (owner, repoName, repoUrl, language/framework) used by AnalysisRun.
- AnalysisRun: one verification workflow for a candidate/repo/targetRole; stores status, tenant, overallScore, roleFit, verificationLevel, providerMatrix, ownershipStatus, terminalEvidence summaries, profileSummary, improvementPlan, employerVerifier, authenticitySignals, completedAt.
- SkillScore: per-run skill scores with scoreSource including llm, terminal, github_api, local_clone, interview, challenge, deterministic, and not_measured.
- EvidenceFinding: per-run evidence claims with safe flags (candidateSafe/employerSafe/publicSafe/adminOnly), redactedText, file/commit references, confidence, rawTextHash; never raw private traces.
- PublicProfile: profile slug, visibility public|unlisted|private, candidateId, ownerUserId, runId, includeTerminalProof, cached interviewKit.
- Tenant / TenantMembership: college/employer/platform organizations and user memberships.
- Cohort / CohortStudent / TenantInvite: college roster and invite data tied to Candidate rows.
- ProviderConfig / AgentConfig / PromptVersion: admin-managed AI provider, evaluator-agent, and prompt registry.
- ChatSession / ChatMessage / ChatToolCall / ChatActionApproval / ChatKnowledgeSource: copilot transcript, tool execution, approval, and knowledge metadata.
- AuditLog: admin/security actions and tool usage audit trail.`;

export const ADMIN_DATA_CAPABILITIES_SUMMARY = `Admin Intelligence Copilot data capabilities:
- Can read platform overview counts, users, candidates/students, profiles, runs, scores, repositories, tenants, cohorts, provider readiness, agents, prompts, audit-log metadata, and safe evidence summaries through typed server-side tools.
- Can answer "students whose profiles have been created" with list_students_with_profiles without requiring candidateId/profileId/runId.
- Can explain where data is stored (explain_data_model), how verification data flows to profiles (explain_project_architecture), and which routes/files implement a feature (explain_route_or_feature).
- Cannot read raw .env, secrets, account/session tokens, raw provider outputs, raw terminal logs, raw model traces, raw prompts, private keys, arbitrary SQL, or arbitrary shell output.
- Read tools execute immediately and are audited. Write/sensitive/destructive tools require approval gates.`;

export const ROLE_PERMISSIONS_SUMMARY = `RBAC: candidates mutate only their own runs/proof; employers consume
PublicProfiles only (no run-level access); college members read runs within their tenant; admin/super_admin
operate everything. Evidence is tiered candidateSafe < employerSafe < publicSafe, with adminOnly traces never
crossing to public/employer surfaces. Tenant scoping isolates college/employer data.`;

/**
 * Role-aware answer to "How do I use SkillProof AI?". Pure + deterministic so it
 * is unit-testable and identical whether or not a provider is reachable.
 */
export function buildHelpGuidance(role: Role | "anonymous"): { role: string; steps: string[] } {
  switch (role) {
    case "candidate":
      return {
        role: "candidate",
        steps: [
          "Start a verification: paste your real GitHub repo and pick a target role.",
          "Prove ownership of the repo (ownership challenge) so results can carry a verified badge.",
          "Complete the own-code interview about your actual code.",
          "Complete the AI-collaboration challenge to show how you work with AI tools.",
          "Review your evidence-backed scores, then publish an employer-safe public profile.",
        ],
      };
    case "employer":
      return {
        role: "employer",
        steps: [
          "Search verified candidates by skill, role, and signal.",
          "Compare candidates side by side on evidence-backed scores.",
          "Shortlist promising candidates into a saved list.",
          "Open the interview kit for tailored, code-grounded questions.",
        ],
      };
    case "college_admin":
    case "college_member":
      return {
        role: "college",
        steps: [
          "Create cohorts and invite students.",
          "Track placement readiness across the cohort.",
          "Review skill gaps to target teaching.",
          "Share an employer-facing talent pool when ready.",
        ],
      };
    case "admin":
    case "super_admin":
      return {
        role: "admin",
        steps: [
          "Configure and health-test providers under Admin → Providers / Provider health.",
          "Assign provider/model/reasoning per agent under Admin → Agents.",
          "Manage prompt versions under Admin → Prompts.",
          "Inspect runs, failures, and evidence; review the audit log.",
          "Use the Command Copilot for guided diagnostics and approved changes.",
        ],
      };
    default:
      return {
        role: "anonymous",
        steps: [
          "Sign in or pick your role to get started.",
          "Candidates verify a GitHub repo; employers search verified candidates; colleges track cohorts.",
        ],
      };
  }
}

export type CopilotContext = {
  mode: CopilotMode;
  page: string | null;
  user: { role: Role | "anonymous"; signedIn: boolean };
  product: string;
  routeMap: typeof ROUTE_MAP;
  roleGuidance: { role: string; steps: string[] };
  rolePermissions?: string;
  schemaSummary?: string;
  adminDataCapabilities?: string;
  platformOverviewSnapshot?: unknown;
  providerRegistry?: unknown; // admin only, redacted
};

type RegistrySnapshotDeps = {
  listProviderConfigs: () => Promise<any[]>;
  listAgentConfigs: () => Promise<any[]>;
  checkReadiness: (mode: "api" | "cli" | "hybrid" | "local") => Promise<any>;
  platformOverviewSnapshot?: () => Promise<unknown>;
};

/**
 * Build the context object for a turn. For admin mode we attach a redacted
 * provider/agent registry snapshot and readiness blockers. Help mode never
 * receives registry internals or cross-role data.
 */
export async function buildCopilotContext(
  opts: { mode: CopilotMode; page?: string | null; user: SessionUser | null },
  deps?: RegistrySnapshotDeps,
): Promise<CopilotContext> {
  const role: Role | "anonymous" = opts.user?.role ?? "anonymous";
  const base: CopilotContext = {
    mode: opts.mode,
    page: opts.page ?? null,
    user: { role, signedIn: !!opts.user },
    product: PRODUCT_SUMMARY,
    routeMap: ROUTE_MAP,
    roleGuidance: buildHelpGuidance(role),
  };

  if (opts.mode !== "admin") return base;

  // Admin context — only assembled for genuine admins.
  if (!opts.user || !isAdminRole(opts.user.role)) return base;

  base.rolePermissions = ROLE_PERMISSIONS_SUMMARY;
  base.schemaSummary = SCHEMA_SUMMARY;
  base.adminDataCapabilities = ADMIN_DATA_CAPABILITIES_SUMMARY;

  if (deps) {
    try {
      const [providers, agents, readiness, platformOverviewSnapshot] = await Promise.all([
        deps.listProviderConfigs(),
        deps.listAgentConfigs(),
        deps.checkReadiness("api").catch(() => null),
        deps.platformOverviewSnapshot?.().catch(() => null) ?? Promise.resolve(null),
      ]);
      if (platformOverviewSnapshot) {
        base.platformOverviewSnapshot = redactDeep(platformOverviewSnapshot);
      }
      base.providerRegistry = redactDeep({
        providers: providers.map((p) => ({
          providerId: p.providerId,
          label: p.label,
          kind: p.kind,
          enabled: p.enabled,
          defaultModel: p.defaultModel,
          // names of env vars only — never their values
          apiKeyEnv: p.apiKeyEnv,
          lastTestStatus: p.lastTestStatus,
          lastTestJsonOk: p.lastTestJsonOk,
          lastTestedAt: p.lastTestedAt,
        })),
        agents: agents.map((a) => ({
          agentName: a.agentName,
          providerId: a.providerId,
          model: a.model,
          reasoningBudget: a.reasoningBudget,
          enabled: a.enabled,
        })),
        readiness: readiness
          ? { ok: readiness.ok, blockers: readiness.blockers }
          : { ok: false, blockers: [{ reason: "readiness unavailable" }] },
      });
    } catch {
      base.providerRegistry = { error: "registry snapshot unavailable" };
    }
  }

  return base;
}
