import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import { buildContextBlock } from "./_analysis";
import type { Handoff, MissionState, TestingOutput, ValidationAssertionResult } from "./types";

const SYSTEM = `You are the Testing & Reliability agent of SkillProof AI.
Use ONLY the provided file index and snippets. Return STRICT JSON:
{
  "testing_score": number (0-100),
  "test_count": number,
  "has_e2e": boolean,
  "has_ci": boolean,
  "evidence": [{"file": string, "reason": string}]
}`;

function fallback(state: MissionState): TestingOutput {
  const pack = state.context_pack!;
  const hasTests = pack.filesIndex.tests.length > 0;
  return {
    testing_score: hasTests ? 55 : 25,
    test_count: pack.filesIndex.tests.length,
    has_e2e: pack.filesIndex.tests.some((p) => /e2e|cypress|playwright/i.test(p)),
    has_ci: pack.detected.hasCI,
    evidence: [
      { reason: `${pack.filesIndex.tests.length} test files detected by scanner.` },
      { reason: pack.detected.hasCI ? "CI workflow present." : "No CI workflow detected." },
    ],
    score_source: "heuristic",
  };
}

function deriveAssertionResults(state: MissionState, out: TestingOutput): ValidationAssertionResult[] {
  const contract = state.contract;
  if (!contract) return [];
  return contract.assertions
    .filter((a) => a.dimension === "testing")
    .map((a) => {
      const wantsCI = /ci/i.test(a.statement);
      const status: ValidationAssertionResult["status"] = wantsCI
        ? out.has_ci ? "passed" : "failed"
        : out.test_count > 0 ? (out.testing_score >= 60 ? "passed" : "partial") : "failed";
      return {
        assertion_id: a.id,
        dimension: a.dimension,
        statement: a.statement,
        status,
        evidence: out.evidence.slice(0, 2),
        responsible_agent: "testing",
        notes: status === "failed"
          ? wantsCI ? "No CI workflow detected by scanner." : "No tests detected by scanner."
          : "Tests/CI present.",
      } as ValidationAssertionResult;
    });
}

export async function runTesting(state: MissionState): Promise<Handoff<TestingOutput>> {
  if (!state.context_pack) throw new Error("testing: context_pack missing");
  let out: TestingOutput;
  let tin = 0, tout = 0;

  if (isMockMode()) {
    out = { ...fallback(state), score_source: state.mock_mode ? "mock" : "heuristic" };
  } else {
    const user = `${buildContextBlock(state.context_pack)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "worker", system: SYSTEM, user, maxTokens: 1200 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      const parsed = extractJson<TestingOutput>(r.text);
      out = parsed ? { ...parsed, score_source: "llm" } : { ...fallback(state), score_source: "heuristic" };
    } catch {
      out = { ...fallback(state), score_source: "heuristic" };
    }
  }

  out.assertion_results = deriveAssertionResults(state, out);

  state.tokens_in += tin;
  state.tokens_out += tout;
  state.scores.push({
    skill: "Testing",
    score: out.testing_score,
    evidence: out.evidence,
    confidence: out.score_source === "llm" ? 0.85 : 0.7, // heuristic for testing is fairly strong
    source: out.score_source ?? "heuristic",
    assertion_ids: out.assertion_results.map((a) => a.assertion_id),
  });
  state.assertion_results.push(...(out.assertion_results ?? []));

  return {
    agent: "testing",
    completed: ["testing_analyzed"],
    unresolved: [],
    evidence: out.evidence,
    issues_found: out.testing_score < 50 ? ["Testing coverage looks weak."] : [],
    next_recommended: "security",
    assertion_results: out.assertion_results,
    output: out,
  };
}
