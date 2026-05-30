// Copilot turn engine: orchestrates one chat turn and the approval lifecycle.
//
// Flow per turn:
//   1. Resolve a ready provider (fail closed — no fake fallback).
//   2. Persist the user message; assemble context + retrieved docs + tool manifest.
//   3. Ask the model for a JSON envelope (reply + optional tool_request).
//   4. If a tool is requested, re-derive permission from the registry + session
//      role (NOT the message). read tools execute inline; write/destructive tools
//      create a pending proposal + approval and DO NOT execute; forbidden/denied
//      tools are refused.
//   5. Persist the assistant message and return a structured result.
//
// Approvals are executed only by approveToolCall, which re-checks RBAC, expiry,
// destructive confirmation phrase, and tool preconditions, then writes an AuditLog.

import { prisma } from "@/lib/db";
import { isAdminRole } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import {
  listAgentConfigs,
  listProviderConfigs,
} from "@/lib/providers/registry";
import { checkProviderReadinessForMode } from "@/lib/providers/provider-router";
import { buildCopilotContext, type CopilotMode } from "./context";
import { searchKnowledge } from "./knowledge";
import { buildSystemPrompt } from "./prompt";
import { resolveChatProvider, runChatTurn, CopilotProviderNotReadyError } from "./provider";
import {
  getTool,
  resolveToolPermission,
  ToolPreconditionError,
  type ToolContext,
  type ToolPlan,
} from "./tools";
import {
  routeCopilotToolIntent,
  manifestForSelection,
  COPILOT_BUDGET,
} from "./tool-router";
import { confirmationPhraseFor, requiresApproval, requiresTypedConfirmation, type RiskLevel } from "./risk";

const APPROVAL_TTL_MS = 30 * 60 * 1000;

export type CopilotProposal = {
  toolCallId: string;
  toolName: string;
  riskLevel: RiskLevel;
  plan: ToolPlan;
  requiresApproval: true;
  requiresTypedConfirmation: boolean;
  confirmationPhrase?: string;
  expiresAt: string;
};

export type CopilotTurnResponse = {
  sessionId: string;
  reply: string;
  providerId: string;
  model: string;
  citations?: string[];
  toolResult?: { toolName: string; data: unknown };
  proposal?: CopilotProposal;
  refusal?: { toolName: string; reason: string; fix?: string; route?: string };
};

export type RunTurnParams = {
  user: SessionUser | null;
  mode: CopilotMode;
  sessionId: string;
  message: string;
  page?: string | null;
  requestedProvider?: string | null;
};

const CONTEXT_DEPS = {
  listProviderConfigs,
  listAgentConfigs,
  checkReadiness: (m: "api" | "cli" | "hybrid" | "local") => checkProviderReadinessForMode(m),
};

/** Re-export so routes can map this to an HTTP provider_not_ready response. */
export { CopilotProviderNotReadyError };

export async function runCopilotTurn(params: RunTurnParams): Promise<CopilotTurnResponse> {
  // Server-side RBAC: admin mode demands a real admin, regardless of client claims.
  if (params.mode === "admin" && !(params.user && isAdminRole(params.user.role))) {
    throw new CopilotForbiddenError("admin_mode_requires_admin");
  }

  const ctx: ToolContext = { user: params.user, mode: params.mode };
  const resolved = await resolveChatProvider(params.requestedProvider); // throws CopilotProviderNotReadyError

  await prisma.chatMessage.create({
    data: { sessionId: params.sessionId, role: "user", content: params.message.slice(0, 8000) },
  });

  // Stage A — deterministic routing decides whether we even need the model.
  const decision = routeCopilotToolIntent({
    message: params.message,
    mode: params.mode,
    role: params.user?.role ?? "anonymous",
  });

  const response: CopilotTurnResponse = {
    sessionId: params.sessionId,
    reply: "",
    providerId: resolved.providerId,
    model: resolved.model,
  };

  if (decision.mode === "refuse" && decision.directTool) {
    // Forbidden intent — record + refuse, no model call.
    response.reply = "I can't do that — it's a forbidden action on this platform.";
    await applyToolRequest(ctx, params.sessionId, decision.directTool.name, decision.directTool.input, response);
  } else if (decision.mode === "direct_execute" && decision.directTool) {
    // Obvious read-only intent — execute one tool and format. Zero model tokens.
    await applyToolRequest(ctx, params.sessionId, decision.directTool.name, decision.directTool.input, response);
    if (response.toolResult) {
      response.reply =
        formatReadToolAnswer(params.message, response.toolResult.toolName, response.toolResult.data) ??
        formatGenericAdminRead(response.toolResult.toolName, response.toolResult.data);
    } else if (!response.reply) {
      response.reply = `I couldn't complete the \`${decision.directTool.name}\` lookup.`;
    }
  } else if (decision.mode === "clarify") {
    response.reply = decision.clarifyQuestion ?? "Could you be more specific about what you'd like to see?";
  } else {
    // Stage B — focused answer generation. The model sees ONLY the small,
    // router-selected manifest (≤5 tools), never the full admin registry.
    const context = await buildCopilotContext(
      { mode: params.mode, page: params.page, user: params.user },
      params.mode === "admin" ? CONTEXT_DEPS : undefined,
    );
    const knowledge = searchKnowledge(params.message, COPILOT_BUDGET.maxContextDocs);
    const manifest = manifestForSelection(decision.selectedTools, params.mode, params.user?.role ?? "anonymous");
    const system = buildSystemPrompt({
      context,
      toolManifest: manifest,
      knowledge,
      tokenBudget: {
        maxResponseTokens: COPILOT_BUDGET.maxChatResponseTokens,
        maxDocChunkChars: COPILOT_BUDGET.maxDocChunkChars,
      },
    });

    const turn = await runChatTurn({ resolved, system, user: params.message.slice(0, 8000) });
    response.reply = turn.envelope.reply;
    response.providerId = turn.providerId;
    response.model = turn.model;
    response.citations = turn.envelope.citations;

    const req = turn.envelope.tool_request;
    if (req?.name) {
      await applyToolRequest(ctx, params.sessionId, req.name, req.input ?? {}, response);
    }
    if (response.toolResult) {
      const formatted = formatReadToolAnswer(params.message, response.toolResult.toolName, response.toolResult.data);
      if (formatted) response.reply = formatted;
    }
  }

  await prisma.chatMessage.create({
    data: {
      sessionId: params.sessionId,
      role: "assistant",
      content: response.reply.slice(0, 8000),
      metadataJson: JSON.stringify({
        providerId: response.providerId,
        model: response.model,
        citations: response.citations ?? [],
        proposalToolCallId: response.proposal?.toolCallId ?? null,
        refusal: response.refusal ?? null,
      }),
    },
  });

  return response;
}

function formatReadToolAnswer(question: string, toolName: string, data: unknown): string | null {
  const result = data as any;
  if (!result || typeof result !== "object") return null;

  switch (toolName) {
    case "list_students_with_profiles":
      return formatStudentsWithProfiles(result);
    case "search_candidates_admin":
      return formatCandidateSearch(result);
    case "get_student_profile_admin":
      return formatStudentDetail(result);
    case "list_profiles_admin":
      return formatProfiles(result);
    case "read_platform_overview":
      return formatPlatformOverview(result);
    case "read_provider_health":
      return formatProviderHealth(result);
    case "read_agent_configs":
      return formatAgentConfigs(result);
    case "read_failed_runs":
      return formatFailedRuns(result);
    case "explain_data_model":
    case "explain_project_architecture":
    case "explain_route_or_feature":
      return formatExplanation(toolName, result);
    default:
      // For other read tools, surface a clean empty-state when there is nothing.
      if (result.ok === true && result.count === 0) {
        return noData(prettyToolTitle(toolName), `No records matched the \`${toolName}\` query.`, [
          "Loosen any filters and ask again.",
        ]);
      }
      return null;
  }
}

// ── Markdown formatting helpers ──────────────────────────────────────────────
// Each read-tool formatter returns professional markdown (heading → one-line
// summary → table/bullets → route/action section) that the chat UI renders with
// the MarkdownMessage component. Raw JSON is never the primary answer.

function mdCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 120);
}

function prettyToolTitle(toolName: string): string {
  return toolName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Render a list of internal routes as markdown route-link bullets. */
function routeBullets(routes: string[], fallback = "Open the matching profile or admin run from the table above."): string[] {
  const unique = Array.from(new Set(routes.filter((r) => typeof r === "string" && r.startsWith("/"))));
  if (!unique.length) return [`- ${fallback}`];
  return unique.slice(0, 12).map((r) => `- [${r}](${r})`);
}

function collectItemRoutes(items: any[]): string[] {
  const set = new Set<string>();
  for (const it of items ?? []) {
    for (const r of it?.routes ?? []) if (typeof r === "string") set.add(r);
    if (typeof it?.profile?.route === "string") set.add(it.profile.route);
    if (typeof it?.run?.route === "string") set.add(it.run.route);
  }
  return Array.from(set);
}

function recordPairs(record: Record<string, unknown> | undefined | null): string {
  const entries = Object.entries(record ?? {});
  if (!entries.length) return "—";
  return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
}

/** Standardized "No matching data found" answer. */
export function noData(heading: string, detail: string, nextActions: string[]): string {
  return [
    `## ${heading}`,
    "",
    `**No matching data found.** ${detail}`,
    "",
    "## Next action",
    "",
    ...nextActions.map((a) => `- ${a}`),
  ].join("\n");
}

export function formatStudentsWithProfiles(result: any): string {
  const rows: any[] = result.items ?? [];
  if (!rows.length) {
    return noData("Students with created profiles", "No students or candidates have a created profile for this query.", [
      "Broaden the visibility filter to `any`.",
      "Remove any cohort or tenant filter and ask again.",
    ]);
  }
  const shown = rows.slice(0, 15);
  const table = [
    "| Student | Email | GitHub | Profile | Visibility | Score | Role | Repo | Run status |",
    "|---|---|---|---|---|---:|---|---|---|",
    ...shown.map((item) =>
      `| ${mdCell(item.candidate?.name)} | ${mdCell(item.candidate?.email ?? item.candidate?.ownerUserEmail)} | ${mdCell(item.candidate?.githubUsername)} | ${mdCell(item.profile?.slug)} | ${mdCell(item.profile?.visibility)} | ${mdCell(item.run?.overallScore)} | ${mdCell(item.run?.targetRole)} | ${mdCell(item.repository?.fullName ?? item.repository?.name)} | ${mdCell(item.run?.status)} |`,
    ),
  ].join("\n");
  return [
    "## Students with created profiles",
    "",
    `Found **${result.count ?? rows.length}** student/candidate profile record(s) on the platform.`,
    "",
    "## Relevant data",
    "",
    table,
    rows.length > 15 ? `\n_Showing first 15 of ${rows.length}. Narrow the query (cohort, visibility, or search) for more._` : "",
    "",
    "## Next action",
    "",
    ...routeBullets(collectItemRoutes(shown)),
    '- Ask "tell me about <candidate name>" for a full per-student breakdown.',
  ].join("\n");
}

export function formatProfiles(result: any): string {
  const rows: any[] = result.items ?? [];
  if (!rows.length) {
    return noData("Profiles", "No profiles matched this query.", [
      "Try a different visibility (`public`, `unlisted`, `private`, or `any`).",
      "Search by candidate name, email, or repo.",
    ]);
  }
  const shown = rows.slice(0, 15);
  const table = [
    "| Profile | Visibility | Candidate | Owner | Repo | Role | Score |",
    "|---|---|---|---|---|---|---:|",
    ...shown.map((item) =>
      `| ${mdCell(item.profile?.slug)} | ${mdCell(item.profile?.visibility)} | ${mdCell(item.candidate?.email ?? item.candidate?.name)} | ${mdCell(item.candidate?.ownerUserEmail ?? item.ownerEmail)} | ${mdCell(item.repository?.fullName ?? item.repository?.name)} | ${mdCell(item.run?.targetRole)} | ${mdCell(item.run?.overallScore ?? item.run?.score)} |`,
    ),
  ].join("\n");
  return [
    "## Profiles",
    "",
    `Found **${result.count ?? rows.length}** profile(s).`,
    "",
    "## Relevant data",
    "",
    table,
    "",
    "## Next action",
    "",
    ...routeBullets(collectItemRoutes(shown)),
  ].join("\n");
}

export function formatCandidateSearch(result: any): string {
  const rows: any[] = result.items ?? [];
  if (!rows.length) {
    return noData("Candidate search", "No candidates matched this query.", [
      "Lower the minimum score or drop the completed-run filter.",
      "Search by name, email, or GitHub username.",
    ]);
  }
  const shown = rows.slice(0, 15);
  const table = [
    "| Candidate | Linked user | Runs | Completed | Profiles | Best score | Strongest | Weakest |",
    "|---|---|---:|---:|---:|---:|---|---|",
    ...shown.map((item) =>
      `| ${mdCell(item.candidate?.name ?? item.candidate?.email)} | ${mdCell(item.linkedUserEmail)} | ${mdCell(item.runsCount)} | ${mdCell(item.completedRunsCount)} | ${mdCell(item.profilesCount)} | ${mdCell(item.bestScore)} | ${mdCell(item.strongestSkill?.skillName)} | ${mdCell(item.weakestSkill?.skillName)} |`,
    ),
  ].join("\n");
  return [
    "## Candidate search",
    "",
    `Found **${result.count ?? rows.length}** candidate(s).`,
    "",
    "## Relevant data",
    "",
    table,
    "",
    "## Next action",
    "",
    ...routeBullets(collectItemRoutes(shown)),
  ].join("\n");
}

export function formatStudentDetail(result: any): string {
  const d = result.detail;
  if (!d) {
    return noData("Student detail", "No matching student or candidate was found.", [
      "Check the email, GitHub username, or profile slug and ask again.",
    ]);
  }
  const runs: any[] = d.runs ?? [];
  const profiles: any[] = d.profiles ?? [];
  const summary = [
    `- **Candidate:** ${mdCell(d.candidate?.name)} · ${d.candidate?.email ?? "no email"} · GitHub: ${d.candidate?.githubUsername ?? "—"}`,
    `- **Linked user:** ${d.linkedUser?.email ?? d.user?.email ?? "none"}`,
    `- **Cohorts:** ${(d.cohortMemberships ?? []).map((c: any) => c.name ?? c.cohort?.name).filter(Boolean).join(", ") || "—"}`,
    `- **Repositories:** ${(d.repositories ?? []).map((r: any) => `${r.owner}/${r.name ?? r.repoName}`).join(", ") || "—"}`,
    `- **Profiles:** ${profiles.map((p: any) => `${p.slug} (${p.visibility})`).join(", ") || "—"}`,
  ].join("\n");
  const table = runs.length
    ? [
        "| Run | Status | Role | Score | Verification | Repo |",
        "|---|---|---|---:|---|---|",
        ...runs.slice(0, 10).map((r: any) =>
          `| ${mdCell(r.route ?? r.id)} | ${mdCell(r.status)} | ${mdCell(r.targetRole)} | ${mdCell(r.overallScore)} | ${mdCell(r.verificationLevel)} | ${mdCell(r.repository ? `${r.repository.owner}/${r.repository.name ?? r.repository.repoName}` : null)} |`,
        ),
      ].join("\n")
    : "_No verification runs recorded for this candidate yet._";
  return [
    `## Student detail — ${d.candidate?.name ?? d.candidate?.email ?? d.candidate?.id}`,
    "",
    summary,
    "",
    "## Verification runs",
    "",
    table,
    "",
    "## Next action",
    "",
    ...routeBullets(d.routes ?? []),
  ].join("\n");
}

export function formatPlatformOverview(result: any): string {
  const d = result.detail ?? {};
  const readiness = d.providerReadiness ?? {};
  const table = [
    "| Dimension | Breakdown |",
    "|---|---|",
    `| Users by role | ${mdCell(recordPairs(d.usersByRole))} |`,
    `| Profiles by visibility | ${mdCell(recordPairs(d.profilesByVisibility))} |`,
    `| Runs by status | ${mdCell(recordPairs(d.runsByStatus))} |`,
    `| Tenants by kind | ${mdCell(recordPairs(d.tenantsByKind))} |`,
  ].join("\n");
  return [
    "## Platform overview",
    "",
    "Live snapshot of platform counts and provider readiness.",
    "",
    "## Key counts",
    "",
    `- **Candidates:** ${d.candidatesCount ?? 0}`,
    `- **Cohorts:** ${d.cohortsCount ?? 0}`,
    `- **Provider readiness:** ${readiness.ready ?? 0}/${readiness.configured ?? 0} ready (${readiness.enabled ?? 0} enabled)`,
    "",
    "## Relevant data",
    "",
    table,
    "",
    "## Next action",
    "",
    ...routeBullets(result.routes ?? ["/admin/users", "/admin/profiles", "/admin/runs", "/admin/providers/health"]),
  ].join("\n");
}

export function formatExplanation(toolName: string, result: any): string {
  const rows: any[] = result.items ?? [];
  const label =
    toolName === "explain_data_model" ? "Data model" : toolName === "explain_project_architecture" ? "Project architecture" : "Route / feature map";
  if (!rows.length) {
    return noData(label, `No explanation entries were found for \`${toolName}\`.`, [
      "Rephrase the topic, or ask about a specific model, route, or feature.",
    ]);
  }
  return [
    `## ${label}`,
    "",
    `Found **${rows.length}** relevant entr${rows.length === 1 ? "y" : "ies"}.`,
    "",
    "## Details",
    "",
    ...rows.map((row: any) => {
      const name = row.model ?? row.area ?? row.route ?? "entry";
      const text = row.explanation ?? row.purpose ?? "";
      const files = row.files?.length ? ` _Files: ${row.files.join(", ")}._` : "";
      const models = row.models?.length ? ` _Models: ${row.models.join(", ")}._` : "";
      return `- **${name}** — ${text}${files}${models}`;
    }),
    "",
    "## Next action",
    "",
    ...routeBullets(result.routes ?? []),
  ].join("\n");
}

export function formatProviderHealth(result: any): string {
  const rows: any[] = Array.isArray(result) ? result : result?.items ?? [];
  if (!rows.length) {
    return noData("Provider health", "No providers are configured.", [
      "Seed the registry with `npm run db:seed-registry -- --force`, then run a health test.",
    ]);
  }
  const table = [
    "| Provider | Status | Enabled | Installed | Auth | JSON | Model |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((h) =>
      `| ${mdCell(h.label ?? h.providerId)} | ${mdCell(h.status)} | ${mdCell(h.enabled)} | ${mdCell(h.installed)} | ${mdCell(h.authenticated)} | ${mdCell(h.supportsJson)} | ${mdCell(h.configuredModel)} |`,
    ),
  ].join("\n");
  const notReady = rows.filter((h) => h.status !== "ready");
  return [
    "## Provider health",
    "",
    `**${rows.filter((h) => h.status === "ready").length}/${rows.length}** providers are ready.`,
    "",
    "## Relevant data",
    "",
    table,
    "",
    "## Next action",
    "",
    ...(notReady.length
      ? notReady.slice(0, 6).map((h) => `- \`${h.providerId}\`: ${mdCell(h.fix) || "open health and run a test"}`)
      : ["- All providers ready — you can start verifications."]),
    "- [/admin/providers/health](/admin/providers/health)",
  ].join("\n");
}

export function formatAgentConfigs(result: any): string {
  const rows: any[] = Array.isArray(result) ? result : result?.items ?? [];
  if (!rows.length) return noData("Agent configs", "No agent configurations were found.", ["Seed the registry, then revisit Admin → Agents."]);
  const table = [
    "| Agent | Provider | Model | Reasoning | Enabled | Fallback |",
    "|---|---|---|---|---|---|",
    ...rows.map((a) =>
      `| ${mdCell(a.agentName)} | ${mdCell(a.providerId)} | ${mdCell(a.model)} | ${mdCell(a.reasoningBudget)} | ${mdCell(a.enabled)} | ${mdCell(a.fallbackProvider ?? "—")} / ${mdCell(a.fallbackStrategy)} |`,
    ),
  ].join("\n");
  const deterministic = rows.filter((a) => a.providerId === "deterministic").length;
  return [
    "## Agent configs",
    "",
    `**${rows.length}** agents configured (${deterministic} deterministic / no-LLM).`,
    "",
    "## Relevant data",
    "",
    table,
    "",
    "## Next action",
    "",
    "- [/admin/agents](/admin/agents)",
  ].join("\n");
}

export function formatFailedRuns(result: any): string {
  const rows: any[] = Array.isArray(result) ? result : result?.items ?? [];
  if (!rows.length) {
    return noData("Failed runs", "No failed runs were found — nothing is broken right now.", [
      "Check [/admin/runs](/admin/runs) for the full run history.",
    ]);
  }
  const table = [
    "| Run | Mode | Failure reason |",
    "|---|---|---|",
    ...rows.slice(0, 15).map((r) => `| [${mdCell(r.id)}](/admin/runs/${r.id}) | ${mdCell(r.executionMode)} | ${mdCell(r.lastFailureReason ?? r.statusMessage)} |`),
  ].join("\n");
  return [
    "## Failed runs",
    "",
    `Found **${rows.length}** failed run(s).`,
    "",
    "## Relevant data",
    "",
    table,
    "",
    "## Next action",
    "",
    "- Open a run above to inspect its trace and provider events.",
  ].join("\n");
}

/**
 * Safe fallback for any admin read tool that lacks a bespoke formatter. Renders
 * a compact summary (never raw JSON as the main answer). Data is already
 * redacted by the tool layer, so this only shapes it into markdown.
 */
export function formatGenericAdminRead(toolName: string, data: unknown): string {
  const title = prettyToolTitle(toolName);
  const rows: any[] | null = Array.isArray(data) ? data : Array.isArray((data as any)?.items) ? (data as any).items : null;
  if (rows) {
    if (!rows.length) return noData(title, `The \`${toolName}\` lookup returned no records.`, ["Adjust the query and ask again."]);
    const keys = Array.from(new Set(rows.flatMap((r) => (r && typeof r === "object" ? Object.keys(r) : [])))).slice(0, 5);
    const table = [
      `| ${keys.join(" | ")} |`,
      `|${keys.map(() => "---").join("|")}|`,
      ...rows.slice(0, 12).map((r) => `| ${keys.map((k) => mdCell(r?.[k])).join(" | ")} |`),
    ].join("\n");
    return [`## ${title}`, "", `Found **${rows.length}** record(s).`, "", "## Relevant data", "", table].join("\n");
  }
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const bullets = Object.entries(obj)
    .filter(([, v]) => typeof v !== "object")
    .slice(0, 12)
    .map(([k, v]) => `- **${k}:** ${mdCell(v)}`);
  return [`## ${title}`, "", bullets.length ? bullets.join("\n") : "_Lookup completed; no displayable fields._"].join("\n");
}

async function applyToolRequest(
  ctx: ToolContext,
  sessionId: string,
  toolName: string,
  rawInput: Record<string, unknown>,
  response: CopilotTurnResponse,
): Promise<void> {
  const perm = resolveToolPermission(toolName, ctx);
  if (!perm.allowed) {
    // Refused — record forbidden attempts for audit; annotate the reply.
    response.refusal = { toolName, reason: perm.reason };
    if (perm.reason === "forbidden") {
      await prisma.chatToolCall.create({
        data: { sessionId, toolName, riskLevel: "forbidden", status: "rejected", error: "forbidden tool refused" },
      });
      await writeAuditLog({
        action: "admin_copilot.forbidden_refused",
        actorUserId: ctx.user?.id ?? null,
        targetType: "chat_tool",
        targetId: toolName,
        metadata: { mode: ctx.mode },
      });
    }
    if (!/refus|cannot|not allowed/i.test(response.reply)) {
      response.reply += `\n\n(Note: the requested action "${toolName}" was refused: ${perm.reason}.)`;
    }
    return;
  }

  const tool = perm.tool;
  const parsedInput = tool.input.safeParse(rawInput);
  if (!parsedInput.success) {
    response.refusal = { toolName, reason: "invalid_input" };
    response.reply += `\n\n(Note: I could not run "${toolName}" — the inputs were invalid.)`;
    return;
  }
  const input = parsedInput.data;

  // read tools execute inline.
  if (tool.risk === "read" && tool.run) {
    const data = await tool.run(ctx, input);
    if (ctx.mode === "admin") {
      await prisma.chatToolCall.create({
        data: {
          sessionId,
          toolName,
          riskLevel: "read",
          status: "executed",
          inputJson: JSON.stringify(input),
          outputJson: JSON.stringify(data).slice(0, 8000),
          executedAt: new Date(),
        },
      });
      await writeAuditLog({
        action: "admin_copilot.read_tool",
        actorUserId: ctx.user?.id ?? null,
        targetType: "chat_tool",
        targetId: toolName,
        metadata: { tool: toolName },
      });
    }
    response.toolResult = { toolName, data };
    return;
  }

  // write / destructive tools require approval — produce a plan, do NOT execute.
  if (requiresApproval(tool.risk) && tool.plan) {
    let plan: ToolPlan;
    try {
      plan = await tool.plan(ctx, input);
    } catch (err) {
      if (err instanceof ToolPreconditionError) {
        response.refusal = { toolName, reason: err.code, fix: err.fix, route: err.route };
        response.reply += `\n\nI can't do that yet — ${err.message} ${err.fix}`;
        return;
      }
      throw err;
    }

    const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS);
    const toolCall = await prisma.chatToolCall.create({
      data: {
        sessionId,
        toolName,
        riskLevel: tool.risk,
        status: "proposed",
        inputJson: JSON.stringify(input),
        outputJson: JSON.stringify(plan).slice(0, 8000),
      },
    });
    await prisma.chatActionApproval.create({
      data: {
        toolCallId: toolCall.id,
        status: "pending",
        expiresAt,
        approvalText: requiresTypedConfirmation(tool.risk) ? confirmationPhraseFor(toolName) : null,
      },
    });

    response.proposal = {
      toolCallId: toolCall.id,
      toolName,
      riskLevel: tool.risk,
      plan,
      requiresApproval: true,
      requiresTypedConfirmation: requiresTypedConfirmation(tool.risk),
      confirmationPhrase: requiresTypedConfirmation(tool.risk) ? confirmationPhraseFor(toolName) : undefined,
      expiresAt: expiresAt.toISOString(),
    };
    return;
  }

  // Allowed but not runnable (misconfigured tool) — refuse safely.
  response.refusal = { toolName, reason: "not_executable" };
}

export type ApprovalResult =
  | { ok: true; toolName: string; result: unknown }
  | { ok: false; code: string; message: string; fix?: string; route?: string };

export async function approveToolCall(
  user: SessionUser,
  toolCallId: string,
  approvalText?: string | null,
): Promise<ApprovalResult> {
  if (!isAdminRole(user.role)) return { ok: false, code: "forbidden", message: "admin required" };

  const toolCall = await prisma.chatToolCall.findUnique({
    where: { id: toolCallId },
    include: { approval: true },
  });
  if (!toolCall) return { ok: false, code: "not_found", message: "tool call not found" };
  if (toolCall.status !== "proposed") {
    return { ok: false, code: "invalid_state", message: `tool call is already ${toolCall.status}` };
  }
  if (toolCall.approval?.expiresAt && toolCall.approval.expiresAt.getTime() < Date.now()) {
    await prisma.chatActionApproval.update({ where: { toolCallId }, data: { status: "expired", resolvedAt: new Date() } });
    await prisma.chatToolCall.update({ where: { id: toolCallId }, data: { status: "failed", error: "approval expired" } });
    return { ok: false, code: "expired", message: "approval expired; ask again" };
  }

  const tool = getTool(toolCall.toolName);
  if (!tool || tool.risk === "forbidden" || !tool.apply) {
    return { ok: false, code: "not_executable", message: "tool cannot be executed" };
  }
  if (requiresTypedConfirmation(tool.risk as RiskLevel)) {
    if ((approvalText ?? "") !== confirmationPhraseFor(toolCall.toolName)) {
      return {
        ok: false,
        code: "confirmation_required",
        message: `type the confirmation phrase exactly: ${confirmationPhraseFor(toolCall.toolName)}`,
      };
    }
  }

  const ctx: ToolContext = { user, mode: "admin" };
  const input = toolCall.inputJson ? JSON.parse(toolCall.inputJson) : {};
  let result: unknown;
  try {
    result = await tool.apply(ctx, input);
  } catch (err) {
    const isPre = err instanceof ToolPreconditionError;
    await prisma.chatToolCall.update({
      where: { id: toolCallId },
      data: { status: "failed", error: (err as Error).message?.slice(0, 500) ?? "apply failed" },
    });
    await prisma.chatActionApproval.update({ where: { toolCallId }, data: { status: "rejected", resolvedAt: new Date() } });
    return {
      ok: false,
      code: isPre ? (err as ToolPreconditionError).code : "apply_failed",
      message: (err as Error).message ?? "apply failed",
      fix: isPre ? (err as ToolPreconditionError).fix : undefined,
      route: isPre ? (err as ToolPreconditionError).route : undefined,
    };
  }

  await prisma.chatToolCall.update({
    where: { id: toolCallId },
    data: { status: "executed", outputJson: JSON.stringify(result).slice(0, 8000), executedAt: new Date() },
  });
  await prisma.chatActionApproval.update({
    where: { toolCallId },
    data: { status: "approved", approvedByUserId: user.id, approvalText: approvalText ?? null, resolvedAt: new Date() },
  });
  await writeAuditLog({
    action: `admin_copilot.${toolCall.toolName}`,
    actorUserId: user.id,
    targetType: "chat_tool",
    targetId: toolCallId,
    metadata: { tool: toolCall.toolName, riskLevel: toolCall.riskLevel, input, result },
  });

  return { ok: true, toolName: toolCall.toolName, result };
}

export async function rejectToolCall(user: SessionUser, toolCallId: string): Promise<ApprovalResult> {
  if (!isAdminRole(user.role)) return { ok: false, code: "forbidden", message: "admin required" };
  const toolCall = await prisma.chatToolCall.findUnique({ where: { id: toolCallId } });
  if (!toolCall) return { ok: false, code: "not_found", message: "tool call not found" };
  if (toolCall.status !== "proposed") return { ok: false, code: "invalid_state", message: `already ${toolCall.status}` };

  await prisma.chatToolCall.update({ where: { id: toolCallId }, data: { status: "rejected" } });
  await prisma.chatActionApproval.updateMany({ where: { toolCallId }, data: { status: "rejected", resolvedAt: new Date() } });
  await writeAuditLog({
    action: "admin_copilot.reject",
    actorUserId: user.id,
    targetType: "chat_tool",
    targetId: toolCallId,
    metadata: { tool: toolCall.toolName },
  });
  return { ok: true, toolName: toolCall.toolName, result: { rejected: true } };
}

export class CopilotForbiddenError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "CopilotForbiddenError";
    this.code = code;
  }
}
