// Mission runner — serial execution with parallel read-only ops where safe.
// Each agent emits a structured Handoff; we persist every step to the DB
// so the mission control UI can stream progress.

import { prisma } from "@/lib/db";
import type { AgentName, Handoff, MissionState, SkillGraphOutput } from "./types";
import { runOrchestrator } from "./orchestrator";
import { runRepoScanner } from "./repo-scanner";
import { runArchitecture } from "./architecture";
import { runCodeQuality } from "./code-quality";
import { runTesting } from "./testing";
import { runSecurity } from "./security";
import { runGitEvidence } from "./git-evidence";
import { runInterviewGen } from "./interview-gen";
import { runValidator } from "./validator";
import { runSkillGraph } from "./skill-graph";
import { runProfileGen } from "./profile-gen";

const PIPELINE: AgentName[] = [
  "orchestrator",
  "repo-scanner",
  "architecture",
  "code-quality",
  "testing",
  "security",
  "git-evidence",
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

// Initialize 11 pending events so the UI can render the lane immediately.
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
  targetRole: string;
  candidateLevel: string;
  jobDescription?: string;
}) {
  const state: MissionState = {
    mission_id: `sp_${opts.runId.slice(0, 8)}`,
    run_id: opts.runId,
    target_role: opts.targetRole,
    candidate_level: opts.candidateLevel,
    contract: null,
    context_pack: null,
    scores: [],
    handoffs: [],
    tokens_in: 0,
    tokens_out: 0,
  };

  await prisma.analysisRun.update({
    where: { id: opts.runId },
    data: { status: "running" },
  });

  // Reset existing events to pending for re-runs; assume preCreateEvents already ran.
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
  try {
    await step("orchestrator", () => runOrchestrator(state, opts.jobDescription));
    await step("repo-scanner", () => runRepoScanner(state, opts.owner, opts.repo));

    // Workers (serial — they share state and the validator audits at the end).
    await step("architecture", () => runArchitecture(state));
    await step("code-quality", () => runCodeQuality(state));
    await step("testing", () => runTesting(state));
    await step("security", () => runSecurity(state));
    await step("git-evidence", () => runGitEvidence(state));
    await step("interview-gen", () => runInterviewGen(state));

    // Creator-verifier separation.
    await step("validator", () => runValidator(state));

    // Final aggregation.
    const graphHandoff = await step("skill-graph", async () => runSkillGraph(state));
    graph = graphHandoff.output as SkillGraphOutput;

    await step("profile-gen", () => runProfileGen(state, graph!));

    // Persist scores + interview questions + token ledger.
    await prisma.skillScore.deleteMany({ where: { runId: opts.runId } });
    await prisma.skillScore.createMany({
      data: graph.skill_graph.map((s) => ({
        runId: opts.runId,
        skillName: s.name,
        score: s.score,
        confidence: s.confidence,
        evidence: JSON.stringify(s.evidence),
      })),
    });

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
        tokenEstimateRaw: state.context_pack?.tokens.rawEstimate ?? 0,
        tokenEstimateUsed: state.context_pack?.tokens.packEstimate ?? 0,
        validationContract: JSON.stringify(state.contract ?? {}),
        contextPack: JSON.stringify({
          meta: state.context_pack?.meta,
          detected: state.context_pack?.detected,
          filesIndex: state.context_pack?.filesIndex,
          tokens: state.context_pack?.tokens,
        }),
      },
    });
  } catch (err) {
    await prisma.analysisRun.update({
      where: { id: opts.runId },
      data: { status: "failed" },
    });
    throw err;
  }
}
