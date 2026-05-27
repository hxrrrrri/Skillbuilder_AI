import { runAgentJson } from "@/lib/providers/run-agent";
import { buildContextBlock } from "./_analysis";
import { hydrateEvidenceFromContext } from "@/lib/evidence";
import { assertionResultsForDimension } from "./assertions";
import {
  getTerminalEvidence,
  hasFailingCommand,
  hasPassingCommand,
} from "@/lib/local-runner/evidence-analysis";
import type { Evidence, Handoff, MissionState, TestingOutput, ValidationAssertionResult } from "./types";

const SYSTEM = `You are the Testing & Reliability agent of SkillProof AI.
Use ONLY the provided file index and snippets. Return STRICT JSON:
{
  "testing_score": number (0-100),
  "test_count": number,
  "has_e2e": boolean,
  "has_ci": boolean,
  "evidence": [{"file": string, "reason": string}]
}`;

const SCHEMA_HINT = '{"testing_score":number,"test_count":number,"has_e2e":boolean,"has_ci":boolean,"evidence":[{"file":string,"reason":string}]}';

function fallback(state: MissionState): TestingOutput {
  const pack = state.context_pack!;
  const hasTests = pack.filesIndex.tests.length > 0;
  return {
    testing_score: hasTests ? 55 : 25,
    test_count: pack.filesIndex.tests.length,
    has_e2e: pack.filesIndex.tests.some((p) => /e2e|cypress|playwright/i.test(p)),
    has_ci: pack.detected.hasCI,
    evidence: [
      { file: pack.filesIndex.tests[0], reason: `${pack.filesIndex.tests.length} test files detected by scanner.` },
      { file: pack.filesIndex.ci[0], reason: pack.detected.hasCI ? "CI workflow present." : "No CI workflow detected." },
    ],
    score_source: "heuristic",
  };
}

function deriveAssertionResults(state: MissionState, out: TestingOutput): ValidationAssertionResult[] {
  return assertionResultsForDimension({
    state,
    dimension: "testing",
    agent: "testing",
    evidence: out.evidence,
    passed: (a) => /ci/i.test(a.statement) ? out.has_ci : out.test_count > 0,
    failed: (a) => /ci/i.test(a.statement) ? !out.has_ci : out.test_count === 0,
    partial: () => out.testing_score >= 45,
    baseNote: "Testing assertion evaluated from test files, CI files, and terminal test evidence.",
  });
}

// Override LLM/heuristic with real test execution if terminal evidence exists.
function applyTerminalEvidence(state: MissionState, out: TestingOutput) {
  const evidence = getTerminalEvidence(state);
  const testPass = hasPassingCommand(evidence, "testing");
  const testFail = hasFailingCommand(evidence, "testing");
  const extra: Evidence[] = [];

  if (testPass) {
    out.testing_score = Math.max(out.testing_score, 70);
    extra.push({
      reason: `terminal · tests PASSED · \`${testPass.command}\` exit=0 (${testPass.durationMs}ms)`,
      snippet: testPass.stdoutSummary.slice(0, 200),
      source: "terminal",
    });
  } else if (testFail) {
    out.testing_score = Math.min(out.testing_score, 45);
    extra.push({
      reason: `terminal · tests FAILED · \`${testFail.command}\` exit=${testFail.exitCode}`,
      snippet: (testFail.stderrSummary || testFail.stdoutSummary).slice(0, 200),
      source: "terminal",
    });
  }

  out.evidence = [...out.evidence, ...extra];
}

export async function runTesting(state: MissionState): Promise<Handoff<TestingOutput>> {
  if (!state.context_pack) throw new Error("testing: context_pack missing");

  const user = `${buildContextBlock(state.context_pack)}

Return the JSON now.`;

  const res = await runAgentJson<TestingOutput>({
    state,
    agentName: "testing",
    role: "worker",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 1200,
    fallback: () => fallback(state),
  });

  const out: TestingOutput = { ...res.output, score_source: res.source };
  out.evidence = hydrateEvidenceFromContext(out.evidence ?? [], state.context_pack, res.source === "llm" ? "llm" : "heuristic");
  applyTerminalEvidence(state, out);
  out.assertion_results = deriveAssertionResults(state, out);

  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;
  state.scores.push({
    skill: "Testing",
    score: out.testing_score,
    evidence: out.evidence,
    confidence: res.source === "llm" ? 0.85 : 0.7,
    source: res.source,
    assertion_ids: out.assertion_results.map((a) => a.assertion_id),
  });
  state.assertion_results.push(...(out.assertion_results ?? []));

  return {
    agent: "testing",
    completed: ["testing_analyzed"],
    unresolved: [],
    evidence: [
      ...out.evidence,
      { reason: `provider=${res.provider} model=${res.model}` },
    ],
    issues_found: out.testing_score < 50 ? ["Testing coverage looks weak."] : [],
    next_recommended: "security",
    assertion_results: out.assertion_results,
    output: out,
  };
}
