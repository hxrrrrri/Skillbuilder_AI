// Mission runner — serial execution. Each agent emits a structured Handoff
// persisted to DB so Mission Control can stream progress.

import { prisma } from "@/lib/db";
import { isMockMode } from "@/lib/claude";
import { runProof } from "@/lib/local-runner/proof-runner";
import { selectProviderMatrix } from "@/lib/providers/provider-router";
import type { ExecutionMode } from "@/lib/local-runner/types";
import type { AgentName, Handoff, MissionState, OwnershipStatus, ProfileOutput, SkillGraphOutput } from "./types";
import { runOrchestrator } from "./orchestrator";
import { runRepoScanner } from "./repo-scanner";
import { runArchitecture } from "./architecture";
import { runCodeQuality } from "./code-quality";
import { runTesting } from "./testing";
import { runSecurity } from "./security";
import { runGitEvidence } from "./git-evidence";
import { runDocumentation } from "./documentation";
import { runAuthenticity } from "./authenticity";
import { runInterviewGen } from "./interview-gen";
import { runValidator } from "./validator";
import { runSkillGraph } from "./skill-graph";
import { runProfileGen } from "./profile-gen";

type RawOwnership = { owner_match: boolean; repo_token_verified: boolean; collaborator_verified?: boolean; self_declared: boolean; gh_user?: string | null };

function buildOwnershipStatus(opts: {
  raw: RawOwnership;
  repoOwner: string;
  githubUsername: string | null;
  verificationToken?: string | null;
}): OwnershipStatus {
  const { raw, repoOwner, githubUsername, verificationToken } = opts;
  const notes: string[] = [];
  let confidence: OwnershipStatus["confidence"] = "unverified";
  let verification_method: OwnershipStatus["verification_method"] = "unverified";
  if (raw.owner_match) {
    confidence = "verified";
    verification_method = "owner_match";
    notes.push(`gh authenticated user matches repo owner '${repoOwner}'.`);
  } else if (raw.repo_token_verified) {
    confidence = "verified";
    verification_method = "repo_token_verified";
    notes.push(`Repo contains SkillProof ownership token for '${githubUsername}'.`);
  } else if (raw.collaborator_verified) {
    confidence = "verified";
    verification_method = "collaborator_verified";
    notes.push(`gh authenticated user is a collaborator on '${repoOwner}'.`);
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
    verification_token: verificationToken ?? null,
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
  "git-evidence",
  "documentation",
  "authenticity",
  "interview-gen",
  "validator",
  "skill-graph",
  "profile-gen",
];

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
    tokens_in: 0,
    tokens_out: 0,
    mock_mode: mode === "mock" || (mode === "api" && isMockMode()),
    execution_mode: mode,
    provider_matrix: null,
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
  const ownershipToken = opts.githubUsername
    ? `skillproof:${opts.githubUsername}:${opts.runId}:${opts.runId.slice(-8)}`
    : null;
  if ((mode === "cli" || mode === "hybrid") && opts.repoUrl) {
    try {
      proof = await runProof({
        runId: opts.runId,
        repoUrl: opts.repoUrl,
        repoOwner: opts.owner,
        githubUsername: opts.githubUsername ?? null,
        ownershipToken,
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
      verificationToken: ownershipToken,
    });
    state.ownership_status = ownership;
  } else {
    state.ownership_status = buildOwnershipStatus({
      raw: { owner_match: false, repo_token_verified: false, self_declared: !!opts.githubUsername },
      repoOwner: opts.owner,
      githubUsername: opts.githubUsername ?? null,
      verificationToken: ownershipToken,
    });
  }

  await prisma.analysisRun.update({
    where: { id: opts.runId },
    data: {
      status: "running",
      statusMessage: state.mock_mode ? "Heuristic/Mock mode active." : `Execution mode: ${mode}`,
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
    await prisma.agentEvent.update({
      where: { id: evId },
      data: { status: "running", startedAt: new Date() },
    });
    try {
      const handoff = await fn();
      state.handoffs.push(handoff as Handoff);
      await completeEvent(evId, handoff as Handoff);
      return handoff;
    } catch (err) {
      await failEvent(evId, err);
      throw err;
    }
  }

  let graph: SkillGraphOutput | null = null;
  let profile: ProfileOutput | null = null;
  try {
    await step("orchestrator", () => runOrchestrator(state, opts.jobDescription));
    await step("repo-scanner", () => runRepoScanner(state, opts.owner, opts.repo));

    await step("architecture", () => runArchitecture(state));
    await step("code-quality", () => runCodeQuality(state));
    await step("testing", () => runTesting(state));
    await step("security", () => runSecurity(state));
    await step("git-evidence", () => runGitEvidence(state));
    await step("documentation", () => runDocumentation(state));
    await step("authenticity", () => runAuthenticity(state));
    await step("interview-gen", () => runInterviewGen(state));

    const validatorHandoff = await step("validator", () => runValidator(state));

    const graphHandoff = await step("skill-graph", async () => runSkillGraph(state));
    graph = graphHandoff.output as SkillGraphOutput;

    const profileHandoff = await step("profile-gen", () => runProfileGen(state, graph!));
    profile = profileHandoff.output as ProfileOutput;

    // Persist scores.
    await prisma.skillScore.deleteMany({ where: { runId: opts.runId } });
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
        completedAt: new Date(),
        overallScore: graph.overall_score,
        roleFit: graph.role_fit,
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
        validationCoverage: JSON.stringify(validatorHandoff.output.assertion_coverage),
        validationSummary: JSON.stringify(validatorHandoff.output.assertion_coverage_summary),
        authenticitySignals: JSON.stringify(state.authenticity ?? null),
        improvementPlan: JSON.stringify(profile?.improvement_plan ?? null),
        employerVerifier: JSON.stringify(profile?.employer_verifier ?? null),
        profileSummary: JSON.stringify(profile ?? null),
      },
    });
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
