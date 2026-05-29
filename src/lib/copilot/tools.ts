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

export const TOOLS: ToolDef[] = [...helpTools, ...adminReadTools, ...adminWriteTools, ...forbiddenTools];

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
