// Mission runner — serial execution. Each agent emits a structured Handoff
// persisted to DB so Mission Control can stream progress.

import { prisma } from "@/lib/db";
import { isMockMode } from "@/lib/claude";
import { runProof } from "@/lib/local-runner/proof-runner";
import { selectProviderMatrix } from "@/lib/providers/provider-router";
import type { ExecutionMode } from "@/lib/local-runner/types";
import type { AgentName, Handoff, MissionState, ProfileOutput, SkillGraphOutput } from "./types";
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
  };

  // Select provider matrix early so Mission Control can display it.
  let providerMatrix: any = null;
  try {
    providerMatrix = await selectProviderMatrix(mode);
  } catch {
    providerMatrix = null;
  }

  // Run local proof runner first when execution mode uses CLI/hybrid.
  let proof: Awaited<ReturnType<typeof runProof>> | null = null;
  if ((mode === "cli" || mode === "hybrid") && opts.repoUrl) {
    try {
      proof = await runProof({
        runId: opts.runId,
        repoUrl: opts.repoUrl,
        repoOwner: opts.owner,
        githubUsername: opts.githubUsername ?? null,
      });
    } catch (err) {
      console.error("[proof-runner] failed", err);
    }
  }

  await prisma.analysisRun.update({
    where: { id: opts.runId },
    data: {
      status: "running",
      statusMessage: state.mock_mode ? "Heuristic/Mock mode active." : `Execution mode: ${mode}`,
      executionMode: mode,
      providerMatrix: providerMatrix ? JSON.stringify(providerMatrix) : null,
      terminalEvidence: proof ? JSON.stringify(proof.evidence) : null,
      ownershipStatus: proof ? JSON.stringify(proof.ownership) : null,
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
          expectedSignals: JSON.stringify(q.expected_signals ?? []),
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
        validationCoverage: JSON.stringify(validatorHandoff.output.assertion_coverage),
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
