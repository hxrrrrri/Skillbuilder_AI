import { composeAgentSystem } from "./prompt-policy";
import { runAgentJson } from "@/lib/providers/run-agent";
import { hydrateEvidenceFromContext } from "@/lib/evidence";
import type { Handoff, InterviewGenOutput, InterviewQuestionT, MissionState } from "./types";

const SYSTEM = `You are the Interview Generator agent of SkillProof AI.
Generate 5-7 own-code interview questions tailored to the candidate's repo.
Questions must reference specific files/decisions from the snippets — generic CS trivia is forbidden.
Return STRICT JSON:
{
  "questions": [
    {
      "id": "q1",
      "question": string,
      "source_file": string (must match a path in the snippets),
      "line_start": number?,
      "line_end": number?,
      "expected_signals": string[] (what a strong answer would demonstrate),
      "red_flags": string[],
      "scoring_rubric": {
        "communication": string,
        "debugging": string,
        "architecture_explanation": string,
        "testing_reasoning": string,
        "understanding_of_own_code": string
      }
    }
  ]
}
Cover a spread: architecture, debugging, testing, tradeoffs, security, data flow, AI collaboration.`;

const SCHEMA_HINT = '{"questions":[{"id":string,"question":string,"source_file":string,"line_start":number?,"line_end":number?,"expected_signals":string[],"red_flags":string[],"scoring_rubric":{"communication":string,"debugging":string,"architecture_explanation":string,"testing_reasoning":string,"understanding_of_own_code":string}}]}';

const DEFAULT_RUBRIC: InterviewQuestionT["scoring_rubric"] = {
  communication: "Explains the answer clearly with concrete references to the repo.",
  debugging: "Identifies likely failure modes and how to verify them.",
  architecture_explanation: "Connects the file to surrounding modules and tradeoffs.",
  testing_reasoning: "Names meaningful tests or validation steps.",
  understanding_of_own_code: "Shows specific familiarity with implementation details.",
};

function question(
  id: string,
  prompt: string,
  sourceFile: string | null,
  expectedSignals: string[],
  redFlags: string[] = ["Generic answer", "Cannot connect explanation to the cited file"]
): InterviewQuestionT {
  return {
    id,
    question: prompt,
    source_file: sourceFile,
    line_start: sourceFile ? 1 : undefined,
    line_end: sourceFile ? 5 : undefined,
    expected_signals: expectedSignals,
    red_flags: redFlags,
    scoring_rubric: DEFAULT_RUBRIC,
  };
}

function normalizeQuestions(out: InterviewGenOutput, fallbackFile: string): InterviewGenOutput {
  return {
    questions: (out.questions ?? []).slice(0, 7).map((q, i) => ({
      ...question(
        q.id || `q${i + 1}`,
        q.question,
        q.source_file ?? fallbackFile,
        q.expected_signals ?? [],
      ),
      ...q,
      line_start: q.line_start ?? 1,
      line_end: q.line_end ?? 5,
      red_flags: q.red_flags?.length ? q.red_flags : ["Generic answer", "Cannot connect explanation to the cited file"],
      scoring_rubric: q.scoring_rubric ?? DEFAULT_RUBRIC,
    })),
  };
}

function fallback(state: MissionState): InterviewGenOutput {
  const pack = state.context_pack!;
  const file = pack.filesIndex.important[0] ?? pack.filesIndex.readme ?? "README";
  const testFile = pack.filesIndex.tests[0] ?? file;
  const securityFile = pack.intelligence?.schemas[0]?.file ?? file;
  return {
    questions: [
      question("q1", `Architecture: in ${file}, walk through the main responsibility and its key dependencies.`, file, ["module responsibility", "dependency awareness", "failure impact"]),
      question("q2", `Debugging: if ${file} started returning empty output, what exact checks would you run first?`, file, ["reproduction steps", "logs or assertions", "hypothesis ordering"]),
      question("q3", `Testing: what should ${testFile} prove, and what critical path is still uncovered?`, testFile, ["test intent", "coverage gap", "edge cases"]),
      question("q4", `Tradeoff: name one design choice in ${file}, the alternative, and why you accepted the downside.`, file, ["alternative considered", "explicit downside", "role-fit reasoning"]),
      question("q5", `Security/data validation: where does untrusted input enter near ${securityFile}, and how is it constrained?`, securityFile, ["trust boundary", "validation or sanitization", "failure mode"]),
      question("q6", `Data flow: trace one user or API flow through ${file} from input to output.`, file, ["source", "transformation", "side effects"]),
      question("q7", `AI collaboration: if an AI assistant changed ${file}, how would you review the patch before merging?`, file, ["diff review", "tests", "limitations", "ownership"]),
    ],
  };
}

export async function runInterviewGen(state: MissionState): Promise<Handoff<InterviewGenOutput>> {
  if (!state.context_pack) throw new Error("interview-gen: context_pack missing");

  const user = "Generate repo-specific interview questions from the focused context and return the JSON now.";

  const res = await runAgentJson<InterviewGenOutput>({
    state,
    agentName: "interview-gen",
    role: "interview",
    system: composeAgentSystem(SYSTEM),
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 1600,
    useSelectedContext: true,
  });

  const fallbackFile = state.context_pack.filesIndex.important[0] ?? state.context_pack.filesIndex.readme ?? "README";
  if (!res.output.questions?.length) {
    throw new Error("interview-gen returned no questions");
  }
  const out = normalizeQuestions(res.output, fallbackFile);

  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;

  return {
    agent: "interview-gen",
    completed: ["questions_generated"],
    unresolved: [],
    evidence: [
      ...hydrateEvidenceFromContext(
        out.questions.map((q) => ({
          file: q.source_file ?? undefined,
          line_start: q.line_start,
          line_end: q.line_end,
          reason: `Q: ${q.question}`,
        })),
        state.context_pack,
        "github_api",
      ),
      { reason: `provider=${res.provider} model=${res.model}` },
    ],
    issues_found: [],
    next_recommended: "validator",
    output: out,
  };
}
