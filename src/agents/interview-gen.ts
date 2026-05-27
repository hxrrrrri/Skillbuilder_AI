import { runAgentJson } from "@/lib/providers/run-agent";
import { buildContextBlock } from "./_analysis";
import type { Handoff, InterviewGenOutput, MissionState } from "./types";

const SYSTEM = `You are the Interview Generator agent of SkillProof AI.
Generate FIVE mock interview questions tailored to the candidate's own repo.
Questions must reference specific files/decisions from the snippets — generic CS trivia is forbidden.
Return STRICT JSON:
{
  "questions": [
    {
      "id": "q1",
      "question": string,
      "source_file": string (must match a path in the snippets),
      "expected_signals": string[] (what a strong answer would demonstrate)
    }
  ]
}
Cover a spread: architecture decision, debugging reasoning, tradeoff awareness, testing strategy, refactoring proposal.`;

const SCHEMA_HINT = '{"questions":[{"id":string,"question":string,"source_file":string,"expected_signals":string[]}]}';

function fallback(state: MissionState): InterviewGenOutput {
  const pack = state.context_pack!;
  const file = pack.filesIndex.important[0] ?? pack.filesIndex.readme ?? "README";
  return {
    questions: [
      { id: "q1", question: `In ${file}, walk me through the main responsibility and what would break if it failed.`, source_file: file, expected_signals: ["understands own code", "can articulate failure modes"] },
      { id: "q2", question: `Where would you add tests first in this repo, and why?`, source_file: file, expected_signals: ["testing reasoning", "risk awareness"] },
      { id: "q3", question: `Pick one tradeoff you made and explain the alternative you rejected.`, source_file: file, expected_signals: ["tradeoff articulation", "self-awareness"] },
      { id: "q4", question: `If this code received unexpected null input, what happens?`, source_file: file, expected_signals: ["debugging reasoning", "defensive programming"] },
      { id: "q5", question: `Propose one refactor that would improve maintainability the most.`, source_file: file, expected_signals: ["maintenance instinct", "concrete change proposal"] },
    ],
  };
}

export async function runInterviewGen(state: MissionState): Promise<Handoff<InterviewGenOutput>> {
  if (!state.context_pack) throw new Error("interview-gen: context_pack missing");

  const user = `Target role: ${state.target_role}

${buildContextBlock(state.context_pack)}

Generate the JSON now.`;

  const res = await runAgentJson<InterviewGenOutput>({
    state,
    role: "interview",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 1600,
    fallback: () => fallback(state),
  });

  const out = res.output.questions?.length ? res.output : fallback(state);

  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;

  return {
    agent: "interview-gen",
    completed: ["questions_generated"],
    unresolved: [],
    evidence: [
      ...out.questions.map((q) => ({ file: q.source_file ?? undefined, reason: `Q: ${q.question}` })),
      { reason: `provider=${res.provider} model=${res.model}` },
    ],
    issues_found: [],
    next_recommended: "validator",
    output: out,
  };
}
