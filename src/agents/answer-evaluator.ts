import { runAgentJson } from "@/lib/providers/run-agent";
import type { AnswerEvaluation, Handoff, InterviewQuestionT, MissionState } from "./types";

type AnswerQuestion = Pick<
  InterviewQuestionT,
  "question" | "source_file" | "expected_signals" | "red_flags"
> & {
  scoring_rubric: InterviewQuestionT["scoring_rubric"] | null;
};

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
A short but technically precise answer beats a long handwave.
Penalize answers that do not reference the cited file, cannot name a failure mode, or use generic phrases like "best practices" without concrete detail.`;

const SCHEMA_HINT = '{"communication_score":number,"debugging_score":number,"architecture_explanation_score":number,"testing_reasoning_score":number,"understanding_of_own_code":number,"summary":string}';

function fallback(answer = ""): AnswerEvaluation {
  const concrete = /\b(src\/|app\/|lib\/|function|route|schema|test|line|component|class|api|error|edge case)\b/i.test(answer);
  const vague = answer.trim().split(/\s+/).length < 18 || /\b(best practices|clean code|robust|scalable)\b/i.test(answer);
  const base = concrete ? 70 : 58;
  const penalty = vague ? 12 : 0;
  return {
    communication_score: Math.max(35, base - penalty + 3),
    debugging_score: Math.max(35, base - penalty),
    architecture_explanation_score: Math.max(35, base - penalty),
    testing_reasoning_score: Math.max(35, base - penalty - 5),
    understanding_of_own_code: Math.max(30, concrete ? base - penalty + 5 : 45),
    summary: concrete
      ? "Heuristic evaluation: answer contained repo-specific signals; deeper line-level references would improve confidence."
      : "Heuristic evaluation: answer was vague or generic; own-code understanding remains weak.",
  };
}

export async function evaluateAnswer(
  state: MissionState,
  question: AnswerQuestion,
  answer: string
): Promise<Handoff<AnswerEvaluation>> {
  const user = `Question: ${question.question}
Source file: ${question.source_file ?? "(none)"}
Expected signals: ${question.expected_signals.join(", ")}
Red flags: ${(question.red_flags ?? []).join(", ") || "(none)"}
Scoring rubric: ${JSON.stringify(question.scoring_rubric ?? null)}

Candidate answer:
"""${answer}"""

Return the JSON now.`;

  const res = await runAgentJson<AnswerEvaluation>({
    state,
    agentName: "answer-evaluator",
    role: "validator",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 800,
  });

  const out = res.output;
  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;

  state.scores.push({
    skill: "Communication",
    score: out.communication_score,
    evidence: [{ reason: `Interview answer for "${question.question.slice(0, 80)}"`, source: "interview" }],
    source: "interview",
  });
  state.scores.push({
    skill: "Debugging",
    score: out.debugging_score,
    evidence: [{ reason: `Interview reasoning for "${question.question.slice(0, 80)}"`, source: "interview" }],
    source: "interview",
  });
  state.scores.push({
    skill: "Understanding of Own Code",
    score: out.understanding_of_own_code,
    evidence: [{ reason: `Own-code interview question: "${question.question.slice(0, 80)}"`, source: "interview" }],
    source: "interview",
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
