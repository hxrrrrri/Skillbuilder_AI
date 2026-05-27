import { runAgentJson } from "@/lib/providers/run-agent";
import type { AnswerEvaluation, Handoff, MissionState } from "./types";

const SYSTEM = `You are the Answer Evaluator agent of SkillProof AI — a creator-verifier agent with FRESH CONTEXT.
You have no investment in any prior analysis. Score the candidate's spoken answer adversarially.
Return STRICT JSON:
{
  "communication_score": number (0-100),
  "debugging_score": number (0-100),
  "architecture_explanation_score": number (0-100),
  "testing_reasoning_score": number (0-100),
  "understanding_of_own_code": number (0-100),
  "summary": string
}
A bluffed answer gets a low understanding score regardless of how polished it sounds.
A short but technically precise answer beats a long handwave.`;

const SCHEMA_HINT = '{"communication_score":number,"debugging_score":number,"architecture_explanation_score":number,"testing_reasoning_score":number,"understanding_of_own_code":number,"summary":string}';

function fallback(): AnswerEvaluation {
  return {
    communication_score: 70,
    debugging_score: 65,
    architecture_explanation_score: 65,
    testing_reasoning_score: 60,
    understanding_of_own_code: 65,
    summary: "Mock mode evaluation — candidate communicated clearly but reasoning depth could not be measured.",
  };
}

export async function evaluateAnswer(
  state: MissionState,
  question: { question: string; source_file: string | null; expected_signals: string[] },
  answer: string
): Promise<Handoff<AnswerEvaluation>> {
  const user = `Question: ${question.question}
Source file: ${question.source_file ?? "(none)"}
Expected signals: ${question.expected_signals.join(", ")}

Candidate answer:
"""${answer}"""

Return the JSON now.`;

  const res = await runAgentJson<AnswerEvaluation>({
    state,
    role: "validator",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 800,
    fallback,
  });

  const out = res.output;
  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;

  state.scores.push({
    skill: "Communication",
    score: out.communication_score,
    evidence: [{ reason: `Interview answer for "${question.question.slice(0, 80)}"` }],
  });
  state.scores.push({
    skill: "Debugging",
    score: out.debugging_score,
    evidence: [{ reason: `Interview reasoning for "${question.question.slice(0, 80)}"` }],
  });

  return {
    agent: "answer-evaluator",
    completed: ["answer_scored"],
    unresolved: [],
    evidence: [
      { reason: out.summary },
      { reason: `provider=${res.provider} model=${res.model}` },
    ],
    issues_found: [],
    output: out,
  };
}
