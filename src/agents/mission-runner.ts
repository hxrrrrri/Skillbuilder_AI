// Mission runner — serial execution. Each agent emits a structured Handoff
// persisted to DB so Mission Control can stream progress.

import { prisma } from "@/lib/db";
import { runProof } from "@/lib/local-runner/proof-runner";
import { AgentSkippedError, selectProviderMatrix } from "@/lib/providers/provider-router";
import { ProviderExecutionError } from "@/lib/providers/errors";
import { resolveAgentConfig } from "@/lib/providers/registry";
import type { ExecutionMode } from "@/lib/local-runner/types";
import type { AgentName, Handoff, MissionState, OwnershipStatus, ProfileOutput, SkillGraphOutput } from "./types";
import { runOrchestrator } from "./orchestrator";
import { runRepoScanner } from "./repo-scanner";
import { runArchitecture } from "./architecture";
import { runCodeQuality } from "./code-quality";
import { runTesting } from "./testing";
import { runSecurity } from "./security";
import { runAICollaborationReview } from "./ai-collaboration";
import { runGitEvidence } from "./git-evidence";
import { runDocumentation } from "./documentation";
import { runAuthenticity } from "./authenticity";
import { runInterviewGen } from "./interview-gen";
import { runValidator } from "./validator";
import { runSkillGraph } from "./skill-graph";
import { runProfileGen } from "./profile-gen";
import { upsertHarnessContextSnapshot } from "@/lib/evaluator-runtime/harness-context";
import {
  completeEvaluatorSkillRun,
  failEvaluatorSkillRun,
  prepareEvaluatorSkillRun,
  AGENT_TO_EVALUATOR_SKILL,
} from "@/lib/evaluator-runtime/skill-runner";

type RawOwnership = { owner_match: boolean; repo_token_verified: boolean; collaborator_verified?: boolean; self_declared: boolean; gh_user?: string | null };

function buildOwnershipStatus(opts: {
  raw: RawOwnership;
  repoOwner: string;
  githubUsername: string | null;
  verificationToken?: string | null;
  ownershipChallengeId?: string | null;
}): OwnershipStatus {
  const { raw, repoOwner, githubUsername, verificationToken, ownershipChallengeId } = opts;
  const notes: string[] = [];
  let confidence: OwnershipStatus["confidence"] = "unverified";
  let verification_method: OwnershipStatus["verification_method"] = "unverified";
  if (raw.owner_match) {
    confidence = "verified";
    verification_method = "owner_match";
    notes.push(`gh authenticated user matches repo owner '${repoOwner}'.`);
  } else if (raw.collaborator_verified) {
    confidence = "verified";
    verification_method = "collaborator_verified";
    notes.push(`gh authenticated user is a collaborator on '${repoOwner}'.`);
  } else if (raw.repo_token_verified) {
    confidence = "verified";
    verification_method = "repo_token_verified";
    notes.push(`Repo contains the server-issued SkillProof ownership challenge token.`);
  } else if (githubUsername) {
    confidence = "self_declared";
    verification_method = "self_declared";
    notes.push(`Self-declared GitHub username '${githubUsername}' — not verified.`);
  } else {
    notes.push("No ownership signals — repo analyzed anonymously.");
  }
  return {
    owner_match: raw.owner_match,
    repo_token_verified: raw.repo_token_verified,
    collaborator_verified: !!raw.collaborator_verified,
    self_declared: !raw.owner_match && !raw.repo_token_verified && !raw.collaborator_verified && !!githubUsername,
    verification_method,
    verification_token: verificationToken ? "server_issued_challenge_token_redacted" : null,
    ownership_challenge_id: ownershipChallengeId ?? null,
    gh_user: raw.gh_user ?? null,
    github_username: githubUsername,
    repo_owner: repoOwner,
    confidence,
    notes,
  };
}

export const PIPELINE: AgentName[] = [
  "orchestrator",
  "repo-scanner",
  "architecture",
  "code-quality",
  "testing",
  "security",
  "ai-collaboration",
  "git-evidence",
  "documentation",
  "authenticity",
  "interview-gen",
  "validator",
  "skill-graph",
  "profile-gen",
];

const PHASE_LABELS: Record<AgentName, string> = {
  orchestrator: "validation contract generating",
  "repo-scanner": "repo scanning",
  architecture: "architecture review",
  "code-quality": "code quality review",
  testing: "testing review",
  security: "security review",
  "ai-collaboration": "AI collaboration review",
  "git-evidence": "git evidence review",
  documentation: "documentation review",
  authenticity: "authenticity review",
  "interview-gen": "interview generation",
  "answer-evaluator": "answer evaluation",
  validator: "validation",
  "skill-graph": "skill graph generation",
  "profile-gen": "profile/report generation",
};

async function recordEvent(runId: string, agent: AgentName, order: number) {
  return prisma.agentEvent.create({
    data: { runId, agentName: agent, status: "running", order, startedAt: new Date() },
  });
}

async function completeEvent(eventId: string, handoff: Handoff) {
  await prisma.agentEvent.update({
    where: { id: eventId },
    data: {
      status: "completed",
      completedAt: new Date(),
      output: JSON.stringify(handoff),
      notes: handoff.issues_found.join(" | "),
    },
  });
}

async function skipEvent(eventId: string, handoff: Handoff) {
  await prisma.agentEvent.update({
    where: { id: eventId },
    data: {
      status: "skipped",
      completedAt: new Date(),
      output: JSON.stringify(handoff),
      notes: handoff.issues_found.join(" | ") || "disabled in admin",
    },
  });
}

async function failEvent(eventId: string, err: unknown) {
  await prisma.agentEvent.update({
    where: { id: eventId },
    data: {
      status: "failed",
      completedAt: new Date(),
      notes: err instanceof Error ? err.message : String(err),
    },
  });
}

function skippedHandoff(agent: AgentName, reason: string, runtime?: Handoff["runtime"]): Handoff {
  return {
    agent,
    completed: [],
    unresolved: [reason],
    evidence: [{ reason }],
    issues_found: [reason],
    runtime,
    output: {
      skipped: true,
      reason,
      runtime,
    },
  };
}

export async function preCreateEvents(runId: string) {
  await prisma.agentEvent.createMany({
    data: PIPELINE.map((agent, i) => ({
      runId,
      agentName: agent,
      status: "pending",
      order: i,
    })),
  });
}

export async function runMission(opts: {
  runId: string;
  owner: string;
  repo: string;
  repoUrl?: string;
  targetRole: string;
  candidateLevel: string;
  candidateName?: string;
  githubUsername?: string;
  jobDescription?: string;
  executionMode?: ExecutionMode;
  localInstallApproved?: boolean;
  ownershipToken?: string;
  ownershipTokenHash?: string | null;
  ownershipChallengeId?: string | null;
}) {
  const mode: ExecutionMode = opts.executionMode ?? "api";
  const state: MissionState = {
    mission_id: `sp_${opts.runId.slice(0, 8)}`,
    run_id: opts.runId,
    target_role: opts.targetRole,
    candidate_level: opts.candidateLevel,
    candidate_name: opts.candidateName ?? null,
    github_username: opts.githubUsername ?? null,
    contract: null,
    context_pack: null,
    scores: [],
    handoffs: [],
    assertion_results: [],
    authenticity: null,
    aiCollaboration: null,
    tokens_in: 0,
    tokens_out: 0,
    mock_mode: false,
    execution_mode: mode,
    provider_matrix: null,
    provider_runtime: {},
    terminal_evidence: [],
    ownership_status: null,
  };

  // Select provider matrix early so Mission Control can display it and agents use it.
  try {
    state.provider_matrix = await selectProviderMatrix(mode);
  } catch {
    state.provider_matrix = null;
  }

  // Run local proof runner first when execution mode uses CLI/hybrid.
  let proof: Awaited<ReturnType<typeof runProof>> | null = null;
  const ownershipToken = opts.ownershipToken ?? null;
  if ((mode === "cli" || mode === "hybrid" || mode === "local") && opts.repoUrl) {
    try {
      proof = await runProof({
        runId: opts.runId,
        repoUrl: opts.repoUrl,
        repoOwner: opts.owner,
        githubUsername: opts.githubUsername ?? null,
        ownershipToken,
        ownershipTokenHash: opts.ownershipTokenHash ?? null,
        policy: {
          allowInstall: true,
          installRequiresApproval: true,
          installApproved: !!opts.localInstallApproved,
          networkAllowed: true,
        },
      });
    } catch (err) {
      console.error("[proof-runner] failed", err);
    }
  }

  if (proof) {
    state.terminal_evidence = proof.evidence;
    const ownership = buildOwnershipStatus({
      raw: proof.ownership,
      repoOwner: opts.owner,
      githubUsername: opts.githubUsername ?? null,
      verificationToken: ownershipToken ? "server_issued_challenge_token_redacted" : null,
      ownershipChallengeId: opts.ownershipChallengeId ?? null,
    });
    state.ownership_status = ownership;
    if (proof.ownership.repo_token_verified && opts.ownershipChallengeId) {
      await prisma.ownershipChallenge.updateMany({
        where: { id: opts.ownershipChallengeId, runId: opts.runId, consumedAt: null },
        data: { consumedAt: new Date(), status: "consumed" },
      }).catch(() => {});
    }
  } else {
    state.ownership_status = buildOwnershipStatus({
      raw: { owner_match: false, repo_token_verified: false, collaborator_verified: false, self_declared: !!opts.githubUsername },
      repoOwner: opts.owner,
      githubUsername: opts.githubUsername ?? null,
      verificationToken: ownershipToken ? "server_issued_challenge_token_redacted" : null,
      ownershipChallengeId: opts.ownershipChallengeId ?? null,
    });
  }

  await prisma.analysisRun.update({
    where: { id: opts.runId },
    data: {
      status: "running",
      statusMessage: `provider readiness checked; execution mode: ${mode}`,
      executionMode: mode,
      localInstallApproved: !!opts.localInstallApproved,
      providerMatrix: state.provider_matrix ? JSON.stringify(state.provider_matrix) : null,
      terminalEvidence: state.terminal_evidence?.length ? JSON.stringify(state.terminal_evidence) : null,
      ownershipStatus: state.ownership_status ? JSON.stringify(state.ownership_status) : null,
    },
  });

  const events = await prisma.agentEvent.findMany({
    where: { runId: opts.runId },
    orderBy: { order: "asc" },
  });

  async function step<T>(name: AgentName, fn: () => Promise<Handoff<T>>): Promise<Handoff<T>> {
    const ev = events.find((e) => e.agentName === name);
    const evId = ev?.id ?? (await recordEvent(opts.runId, name, PIPELINE.indexOf(name))).id;
    const skillRun = await prepareEvaluatorSkillRun({
      agentName: name,
      runId: opts.runId,
      tenantId: state.ownership_status ? null : undefined,
      state,
    });
    if (skillRun.kind === "disabled") {
      const handoff = skippedHandoff(name, skillRun.reason) as Handoff<T>;
      state.handoffs.push(handoff as Handoff);
      await skipEvent(evId, handoff as Handoff);
      return handoff;
    }
    const resolved = await resolveAgentConfig(name);
    const plannedRuntime = state.provider_matrix?.agents?.[name];
    if (!resolved.enabled) {
      const runtime = plannedRuntime
        ? { ...plannedRuntime, status: "skipped" as const, note: "disabled in admin" }
        : {
            provider: resolved.provider,
            model: resolved.model,
            reasoningBudget: resolved.reasoningBudget,
            enabled: false,
            fallbackProvider: resolved.fallbackProvider,
            fallbackModel: resolved.fallbackModel,
            fallbackStrategy: resolved.fallbackStrategy,
            temperature: resolved.temperature,
            maxTokens: resolved.maxTokens,
            jsonMode: resolved.jsonMode,
            timeoutMs: resolved.timeoutMs,
            retryCount: resolved.retryCount,
            source: resolved.source,
            status: "skipped" as const,
            note: "disabled in admin",
          };
      if (state.provider_matrix?.agents) state.provider_matrix.agents[name] = runtime;
      state.provider_runtime = { ...(state.provider_runtime ?? {}), [name]: runtime };
      const handoff = skippedHandoff(name, "disabled in admin", runtime) as Handoff<T>;
      state.handoffs.push(handoff as Handoff);
      await skipEvent(evId, handoff as Handoff);
      await prisma.analysisRun.update({
        where: { id: opts.runId },
        data: {
          providerMatrix: state.provider_matrix ? JSON.stringify(state.provider_matrix) : null,
          statusMessage: `${PHASE_LABELS[name] ?? name} skipped: disabled in admin`,
        },
      });
      return handoff;
    }
    await prisma.agentEvent.update({
      where: { id: evId },
      data: { status: "running", startedAt: new Date() },
    });
    await prisma.analysisRun.update({
      where: { id: opts.runId },
      data: { statusMessage: PHASE_LABELS[name] ?? `${name} running` },
    });
    try {
      const handoff = await fn();
      const runtime = state.provider_runtime?.[name] ?? state.provider_matrix?.agents?.[name];
      const enriched = runtime ? ({ ...handoff, runtime } as Handoff<T>) : handoff;
      state.handoffs.push(enriched as Handoff);
      await completeEvaluatorSkillRun({ prepared: skillRun, state, handoff: enriched as Handoff });
      await completeEvent(evId, enriched as Handoff);
      await prisma.analysisRun.update({
        where: { id: opts.runId },
        data: {
          providerMatrix: state.provider_matrix ? JSON.stringify(state.provider_matrix) : null,
          statusMessage: `${PHASE_LABELS[name] ?? name} completed`,
        },
      });
      return enriched;
    } catch (err) {
      if (err instanceof AgentSkippedError) {
        const runtime = err.runtime ?? state.provider_runtime?.[name] ?? state.provider_matrix?.agents?.[name];
        if (runtime && state.provider_matrix?.agents) state.provider_matrix.agents[name] = runtime;
        if (runtime) state.provider_runtime = { ...(state.provider_runtime ?? {}), [name]: runtime };
        const handoff = skippedHandoff(name, err.message || "skipped", runtime) as Handoff<T>;
        state.handoffs.push(handoff as Handoff);
        await failEvaluatorSkillRun({ prepared: skillRun, state, error: err, handoff: handoff as Handoff });
        await skipEvent(evId, handoff as Handoff);
        await prisma.analysisRun.update({
          where: { id: opts.runId },
          data: {
            providerMatrix: state.provider_matrix ? JSON.stringify(state.provider_matrix) : null,
            statusMessage: `${PHASE_LABELS[name] ?? name} skipped: ${err.message || "provider skipped"}`,
          },
        });
        return handoff;
      }
      await failEvent(evId, err);
      await failEvaluatorSkillRun({ prepared: skillRun, state, error: err });
      if (err instanceof ProviderExecutionError && err.runtime && state.provider_matrix?.agents) {
        state.provider_matrix.agents[name] = err.runtime;
        state.provider_runtime = { ...(state.provider_runtime ?? {}), [name]: err.runtime };
      }
      throw err;
    }
  }

  async function skipDueToDependency<T>(name: AgentName, reason: string): Promise<Handoff<T>> {
    const ev = events.find((e) => e.agentName === name);
    const evId = ev?.id ?? (await recordEvent(opts.runId, name, PIPELINE.indexOf(name))).id;
    const runtime = state.provider_matrix?.agents?.[name];
    const skippedRuntime = runtime ? { ...runtime, status: "skipped" as const, note: reason } : undefined;
    if (skippedRuntime && state.provider_matrix?.agents) state.provider_matrix.agents[name] = skippedRuntime;
    if (skippedRuntime) state.provider_runtime = { ...(state.provider_runtime ?? {}), [name]: skippedRuntime };
    const handoff = skippedHandoff(name, reason, skippedRuntime) as Handoff<T>;
    state.handoffs.push(handoff as Handoff);
    await skipEvent(evId, handoff as Handoff);
    await prisma.analysisRun.update({
      where: { id: opts.runId },
      data: {
        providerMatrix: state.provider_matrix ? JSON.stringify(state.provider_matrix) : null,
        statusMessage: `${PHASE_LABELS[name] ?? name} skipped: ${reason}`,
      },
    });
    return handoff;
  }

  function contextStep<T>(name: AgentName, fn: () => Promise<Handoff<T>>): Promise<Handoff<T>> {
    if (!state.context_pack) {
      return skipDueToDependency(name, "repo context unavailable");
    }
    return step(name, fn);
  }

  let graph: SkillGraphOutput | null = null;
  let profile: ProfileOutput | null = null;
  try {
    await step("orchestrator", () => runOrchestrator(state, opts.jobDescription));
    await step("repo-scanner", () => runRepoScanner(state, opts.owner, opts.repo));
    await upsertHarnessContextSnapshot({
      runId: opts.runId,
      repoUrl: opts.repoUrl ?? `https://github.com/${opts.owner}/${opts.repo}`,
      contextPack: state.context_pack,
      executionMode: mode,
    });

    await contextStep("architecture", () => runArchitecture(state));
    await contextStep("code-quality", () => runCodeQuality(state));
    await contextStep("testing", () => runTesting(state));
    await contextStep("security", () => runSecurity(state));
    await contextStep("ai-collaboration", () => runAICollaborationReview(state));
    await contextStep("git-evidence", () => runGitEvidence(state));
    await contextStep("documentation", () => runDocumentation(state));
    await contextStep("authenticity", () => runAuthenticity(state));
    await contextStep("interview-gen", () => runInterviewGen(state));

    const validatorHandoff = await contextStep("validator", () => runValidator(state));
    const validatorOut = validatorHandoff.output as any;

    const graphHandoff = await step("skill-graph", async () => runSkillGraph(state));
    const maybeGraph = graphHandoff.output as any;
    graph = Array.isArray(maybeGraph?.skill_graph)
      ? (maybeGraph as SkillGraphOutput)
      : {
          overall_score: 0,
          role_fit: `Not measured ${state.target_role}`,
          top_strengths: [],
          growth_areas: [],
          skill_graph: [],
          not_measured: [],
        };

    const profileHandoff = await step("profile-gen", () => runProfileGen(state, graph!));
    const maybeProfile = profileHandoff.output as any;
    profile = maybeProfile?.developer_summary ? (maybeProfile as ProfileOutput) : null;

    // Persist scores.
    await prisma.skillScore.deleteMany({ where: { runId: opts.runId } });
    if (graph.skill_graph.length) {
      await prisma.skillScore.createMany({
        data: graph.skill_graph.map((s) => ({
          runId: opts.runId,
          skillName: s.name,
          score: s.score ?? -1, // -1 sentinel for not measured (UI shows "—")
          confidence: s.confidence,
          scoreSource: s.source,
          evidence: JSON.stringify(s.evidence),
          validatorNotes: s.validator_notes ?? null,
        })),
      });
    }

    // Persist interview questions.
    const interviewHandoff = state.handoffs.find((h) => h.agent === "interview-gen");
    const interviewOut = interviewHandoff?.output as { questions: any[] } | undefined;
    if (interviewOut?.questions?.length) {
      await prisma.interviewQuestion.deleteMany({ where: { runId: opts.runId } });
      await prisma.interviewQuestion.createMany({
        data: interviewOut.questions.map((q) => ({
          runId: opts.runId,
          question: q.question,
          sourceFile: q.source_file ?? null,
          lineStart: q.line_start ?? null,
          lineEnd: q.line_end ?? null,
          expectedSignals: JSON.stringify(q.expected_signals ?? []),
          redFlags: JSON.stringify(q.red_flags ?? []),
          scoringRubric: JSON.stringify(q.scoring_rubric ?? null),
        })),
      });
    }

    await prisma.analysisRun.update({
      where: { id: opts.runId },
      data: {
        status: "completed",
        statusMessage: "completed",
        completedAt: new Date(),
        overallScore: graph.skill_graph.length ? graph.overall_score : null,
        roleFit: graph.skill_graph.length ? graph.role_fit : null,
        verificationLevel: "repo_only",
        tokenEstimateRaw: state.context_pack?.tokens.rawEstimate ?? 0,
        tokenEstimateUsed: state.context_pack?.tokens.packEstimate ?? 0,
        validationContract: JSON.stringify(state.contract ?? {}),
        contextPack: JSON.stringify({
          meta: state.context_pack?.meta,
          detected: state.context_pack?.detected,
          filesIndex: state.context_pack
            ? {
                total: state.context_pack.filesIndex.total,
                important: state.context_pack.filesIndex.important,
                config: state.context_pack.filesIndex.config,
                tests: state.context_pack.filesIndex.tests,
                ci: state.context_pack.filesIndex.ci,
                readme: state.context_pack.filesIndex.readme,
              }
            : null,
          tokens: state.context_pack?.tokens,
        }),
        repoIntelligence: state.context_pack?.intelligence ? JSON.stringify(state.context_pack.intelligence) : null,
        validationCoverage: JSON.stringify(validatorOut?.assertion_coverage ?? []),
        validationSummary: JSON.stringify(
          validatorOut?.assertion_coverage_summary ?? {
            total: 0,
            passed: 0,
            failed: 0,
            partial: 0,
            unknown: 0,
            evidence_coverage_percentage: 0,
          },
        ),
        authenticitySignals: JSON.stringify(state.authenticity ?? null),
        improvementPlan: JSON.stringify(profile?.improvement_plan ?? null),
        employerVerifier: JSON.stringify(profile?.employer_verifier ?? null),
        aiCollaboration: JSON.stringify(state.aiCollaboration ?? null),
        profileSummary: JSON.stringify(profile ?? null),
        providerMatrix: state.provider_matrix ? JSON.stringify(state.provider_matrix) : null,
      },
    });

    try {
      const { finalizeReVerificationForRun } = await import("@/lib/reverification");
      await finalizeReVerificationForRun(opts.runId);
    } catch (err) {
      console.error("[mission] finalize reverification failed", err);
    }
  } catch (err) {
    await prisma.analysisRun.update({
      where: { id: opts.runId },
      data: {
        status: "failed",
        statusMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
