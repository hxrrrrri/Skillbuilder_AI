import { writeAuditLog } from "@/lib/auth/audit";
import type { ToolPermissionPolicy } from "./skill-contracts";

export type RequestedToolUse = Partial<{
  filesystem: ToolPermissionPolicy["filesystem"];
  terminal: ToolPermissionPolicy["terminal"];
  github: ToolPermissionPolicy["github"];
  network: ToolPermissionPolicy["network"];
  mcp: ToolPermissionPolicy["mcp"];
  secrets: ToolPermissionPolicy["secrets"];
}>;

const ORDER = {
  filesystem: ["none", "read_only", "write_sandbox_only"],
  terminal: ["none", "safe_commands_only", "approval_required", "admin_only"],
  github: ["none", "public_read", "token_read", "repo_collab_check"],
  network: ["disabled", "allowlisted_only"],
  mcp: ["disabled", "allowlisted_only"],
  secrets: ["never_expose"],
} as const;

export function defaultPolicy(): ToolPermissionPolicy {
  return {
    filesystem: "read_only",
    terminal: "none",
    github: "public_read",
    network: "disabled",
    mcp: "disabled",
    secrets: "never_expose",
  };
}

function allowed<T extends readonly string[]>(order: T, granted: string | undefined, requested: string | undefined): boolean {
  if (!requested) return true;
  const g = order.indexOf((granted ?? order[0]) as any);
  const r = order.indexOf(requested as any);
  return g >= 0 && r >= 0 && r <= g;
}

export function evaluateToolPermission(policy: ToolPermissionPolicy, requested: RequestedToolUse): {
  allowed: boolean;
  denied: string[];
} {
  const denied: string[] = [];
  if (!allowed(ORDER.filesystem, policy.filesystem, requested.filesystem)) denied.push("filesystem");
  if (!allowed(ORDER.terminal, policy.terminal, requested.terminal)) denied.push("terminal");
  if (!allowed(ORDER.github, policy.github, requested.github)) denied.push("github");
  if (!allowed(ORDER.network, policy.network, requested.network)) denied.push("network");
  if (!allowed(ORDER.mcp, policy.mcp ?? "disabled", requested.mcp)) denied.push("mcp");
  if (requested.secrets && requested.secrets !== "never_expose") denied.push("secrets");
  return { allowed: denied.length === 0, denied };
}

export async function auditPermissionDecision(input: {
  runId: string;
  tenantId?: string | null;
  skillId: string;
  policy: ToolPermissionPolicy;
  requested: RequestedToolUse;
  allowed: boolean;
  denied?: string[];
}) {
  await writeAuditLog({
    action: input.allowed ? "evaluator.permission.granted" : "evaluator.permission.denied",
    actorUserId: null,
    tenantId: input.tenantId ?? null,
    targetType: "EvaluatorSkill",
    targetId: input.skillId,
    metadata: {
      runId: input.runId,
      requested: input.requested,
      policy: input.policy,
      denied: input.denied ?? [],
    },
  }).catch(() => {});
}
