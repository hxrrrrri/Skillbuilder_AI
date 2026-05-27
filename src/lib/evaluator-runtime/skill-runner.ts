import { prisma } from "@/lib/db";
import type { AgentName, Handoff, MissionState } from "@/agents/types";
import { sha256Json, findingFromLegacyEvidence } from "./evidence-contracts";
import { ensureEvaluatorSkill } from "./skill-registry";
import { auditPermissionDecision, evaluateToolPermission, type RequestedToolUse } from "./permission-policy";
import type { ToolPermissionPolicy } from "./skill-contracts";
import { buildAdminTrace } from "./trace";
import { redactText } from "./redaction";

export const AGENT_TO_EVALUATOR_SKILL: Partial<Record<AgentName, string>> = {
  architecture: "repo-architecture-review",
  "code-quality": "code-quality-review",
  testing: "testing-depth-review",
  security: "security-review",
  "ai-collaboration": "ai-collaboration-review",
};

type PreparedSkillRun =
  | { kind: "none" }
  | { kind: "disabled"; skillSlug: string; reason: string }
  | {
      kind: "running";
      skillRunId: string;
      skillSlug: string;
      skillVersion: string;
      startedAt: Date;
      inputHash: string;
      toolPermissions: ToolPermissionPolicy;
    };

const DEFAULT_REQUESTED_TOOLS: RequestedToolUse = {
  filesystem: "read_only",
  terminal: "none",
  github: "public_read",
  network: "disabled",
  mcp: "disabled",
  secrets: "never_expose",
};

export async function prepareEvaluatorSkillRun(input: {
  agentName: AgentName;
  runId: string;
  tenantId?: string | null;
  state: MissionState;
  requestedTools?: RequestedToolUse;
}): Promise<PreparedSkillRun> {
  const skillSlug = AGENT_TO_EVALUATOR_SKILL[input.agentName];
  if (!skillSlug) return { kind: "none" };
  const skill = await ensureEvaluatorSkill(skillSlug);
  if (!skill.enabled) {
    return { kind: "disabled", skillSlug, reason: "evaluator skill disabled in registry" };
  }

  const toolPermissions = JSON.parse(skill.toolPermissionsJson || "{}") as ToolPermissionPolicy;
  const requested = input.requestedTools ?? DEFAULT_REQUESTED_TOOLS;
  const decision = evaluateToolPermission(toolPermissions, requested);
  await auditPermissionDecision({
    runId: input.runId,
    tenantId: input.tenantId,
    skillId: skillSlug,
    policy: toolPermissions,
    requested,
    allowed: decision.allowed,
    denied: decision.denied,
  });
  if (!decision.allowed) {
    const startedAt = new Date();
    const row = await prisma.skillRun.create({
      data: {
        runId: input.runId,
        skillId: skillSlug,
        skillVersion: skill.version,
        agentId: input.agentName,
        status: "failed",
        startedAt,
        endedAt: startedAt,
        durationMs: 0,
        inputHash: sha256Json({ agentName: input.agentName, context: input.state.context_pack?.meta }),
        toolPermissionsJson: JSON.stringify(toolPermissions),
        error: `Denied tool permission: ${decision.denied.join(", ")}`,
        candidateSummary: "This evaluator could not run because a tool permission was denied.",
        employerSummary: "Evaluator blocked by runtime permission policy.",
      },
    });
    return { kind: "disabled", skillSlug: row.skillId, reason: row.error ?? "permission denied" };
  }

  const startedAt = new Date();
  const inputHash = sha256Json({
    agentName: input.agentName,
    skillSlug,
    contextMeta: input.state.context_pack?.meta,
    files: input.state.context_pack?.filesIndex.important,
    runtimeVersion: skill.version,
  });
  const row = await prisma.skillRun.create({
    data: {
      runId: input.runId,
      skillId: skillSlug,
      skillVersion: skill.version,
      agentId: input.agentName,
      status: "running",
      startedAt,
      inputHash,
      toolPermissionsJson: JSON.stringify(toolPermissions),
    },
  });
  return {
    kind: "running",
    skillRunId: row.id,
    skillSlug,
    skillVersion: skill.version,
    startedAt,
    inputHash,
    toolPermissions,
  };
}

export async function completeEvaluatorSkillRun(input: {
  prepared: PreparedSkillRun;
  state: MissionState;
  handoff: Handoff;
}) {
  if (input.prepared.kind !== "running") return;
  const prepared = input.prepared;
  const outputHash = sha256Json(input.handoff.output);
  const findings = input.handoff.evidence
    .filter((e) => typeof e?.reason === "string" && e.reason.trim().length > 0)
    .slice(0, 25)
    .map((e) =>
      findingFromLegacyEvidence({
        runId: input.state.run_id,
        skillRunId: prepared.skillRunId,
        skillSlug: prepared.skillSlug,
        evidence: e,
        contextPack: input.state.context_pack,
      }),
    );

  const createdIds: string[] = [];
  for (const f of findings) {
    const created = await prisma.evidenceFinding.create({
      data: {
        runId: f.runId,
        skillRunId: f.skillRunId,
        category: f.category,
        claim: f.claim,
        evidenceType: f.evidenceType,
        filePath: f.filePath,
        lineStart: f.lineStart,
        lineEnd: f.lineEnd,
        commitSha: f.commitSha,
        commandRunId: f.commandRunId,
        confidence: f.confidence,
        severity: f.severity,
        candidateSafe: f.candidateSafe,
        employerSafe: f.employerSafe,
        publicSafe: f.publicSafe,
        adminOnly: f.adminOnly,
        redactedText: f.redactedText,
        rawTextHash: f.rawTextHash,
      },
    });
    createdIds.push(created.id);
  }

  const runtime = input.handoff.runtime;
  const endedAt = new Date();
  await prisma.skillRun.update({
    where: { id: input.prepared.skillRunId },
    data: {
      status: input.handoff.issues_found.length ? "warning" : "completed",
      endedAt,
        durationMs: endedAt.getTime() - prepared.startedAt.getTime(),
      providerId: runtime?.actualProvider ?? runtime?.provider ?? null,
      requestedModel: runtime?.requestedModel ?? runtime?.model ?? null,
      actualModel: runtime?.actualModel ?? runtime?.model ?? null,
      outputHash,
      evidenceIdsJson: JSON.stringify(createdIds),
      tokenUsageJson: null,
      fallbackReason: runtime?.note ?? null,
      retryHistoryJson: null,
      adminTraceJson: JSON.stringify(
        buildAdminTrace({
          handoff: input.handoff,
          inputHash: prepared.inputHash,
          outputHash,
        }),
      ),
      candidateSummary: summarizeForCandidate(input.handoff),
      employerSummary: summarizeForEmployer(input.handoff, createdIds.length),
    },
  });
}

export async function failEvaluatorSkillRun(input: {
  prepared: PreparedSkillRun;
  error: unknown;
  state: MissionState;
  handoff?: Handoff | null;
}) {
  if (input.prepared.kind !== "running") return;
  const endedAt = new Date();
  await prisma.skillRun.update({
    where: { id: input.prepared.skillRunId },
    data: {
      status: "failed",
      endedAt,
      durationMs: endedAt.getTime() - input.prepared.startedAt.getTime(),
      error: redactText(input.error instanceof Error ? input.error.message : String(input.error), 1000),
      adminTraceJson: JSON.stringify(
        buildAdminTrace({
          handoff: input.handoff ?? null,
          inputHash: input.prepared.inputHash,
          error: input.error,
        }),
      ),
      candidateSummary: "This evaluator failed. Other evaluator skills can still complete the run.",
      employerSummary: "One evaluator failed; remaining evidence-backed results are still available.",
    },
  });
}

function summarizeForCandidate(handoff: Handoff): string {
  const good = handoff.completed[0] ?? "Evaluator completed.";
  const issue = handoff.issues_found[0];
  return issue ? `${good} Next action: ${issue}` : good;
}

function summarizeForEmployer(handoff: Handoff, evidenceCount: number): string {
  const status = handoff.issues_found.length ? "review needed" : "verified signal";
  return `${handoff.agent.replace(/-/g, " ")} produced ${evidenceCount} evidence-backed finding(s); status: ${status}.`;
}
