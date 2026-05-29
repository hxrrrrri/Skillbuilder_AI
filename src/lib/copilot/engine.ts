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
  toolManifest,
  ToolPreconditionError,
  type ToolContext,
  type ToolPlan,
} from "./tools";
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

  const context = await buildCopilotContext(
    { mode: params.mode, page: params.page, user: params.user },
    params.mode === "admin" ? CONTEXT_DEPS : undefined,
  );
  const knowledge = searchKnowledge(params.message, 4);
  const manifest = toolManifest(params.mode, params.user?.role ?? "anonymous");
  const system = buildSystemPrompt({ context, toolManifest: manifest, knowledge });

  const turn = await runChatTurn({ resolved, system, user: params.message.slice(0, 8000) });

  const response: CopilotTurnResponse = {
    sessionId: params.sessionId,
    reply: turn.envelope.reply,
    providerId: turn.providerId,
    model: turn.model,
    citations: turn.envelope.citations,
  };

  const req = turn.envelope.tool_request;
  if (req?.name) {
    await applyToolRequest(ctx, params.sessionId, req.name, req.input ?? {}, response);
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
