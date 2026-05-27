import { runAgentJson } from "@/lib/providers/run-agent";
import { buildContextBlock } from "./_analysis";
import {
  getTerminalEvidence,
  hasFailingCommand,
  hasPassingCommand,
} from "@/lib/local-runner/evidence-analysis";
import type {
  CodeQualityOutput,
  Evidence,
  Handoff,
  MissionState,
  ValidationAssertionResult,
} from "./types";

const SYSTEM = `You are the Code Quality agent of SkillProof AI.
Evaluate maintainability of the provided source snippets only. Do NOT invent files.
Return STRICT JSON:
{
  "code_quality_score": number (0-100),
  "observations": string[],
  "evidence": [{"file": string, "line": number?, "reason": string}]
}`;

const SCHEMA_HINT = '{"code_quality_score":number,"observations":string[],"evidence":[{"file":string,"line":number?,"reason":string}]}';

function fallback(): CodeQualityOutput {
  return {
    code_quality_score: 55,
    observations: ["LLM unavailable — heuristic score only"],
    evidence: [{ reason: "Heuristic mode: deterministic score returned." }],
    score_source: "heuristic",
  };
}

function deriveAssertionResults(state: MissionState, out: CodeQualityOutput): ValidationAssertionResult[] {
  const contract = state.contract;
  if (!contract) return [];
  return contract.assertions
    .filter((a) => a.dimension === "code_quality")
    .map((a) => ({
      assertion_id: a.id,
      dimension: a.dimension,
      statement: a.statement,
      status: out.code_quality_score >= 60 ? "passed" : out.code_quality_score >= 45 ? "partial" : "failed",
      evidence: out.evidence.slice(0, 2),
      responsible_agent: "code-quality",
      notes: out.code_quality_score >= 60 ? "Snippets show reasonable quality." : "Quality issues detected.",
    }) as ValidationAssertionResult);
}

// Apply build + typecheck terminal evidence to nudge code quality score.
function applyTerminalEvidence(state: MissionState, out: CodeQualityOutput) {
  const evidence = getTerminalEvidence(state);
  const extra: Evidence[] = [];
  const buildPass = hasPassingCommand(evidence, "build");
  const buildFail = hasFailingCommand(evidence, "build");
  const tcPass = hasPassingCommand(evidence, "typecheck");
  const tcFail = hasFailingCommand(evidence, "typecheck");

  if (buildPass) {
    out.code_quality_score = Math.min(100, out.code_quality_score + 5);
    extra.push({ reason: `terminal · build OK · \`${buildPass.command}\` exit=0` });
    out.observations.unshift("Local build succeeded.");
  } else if (buildFail) {
    out.code_quality_score = Math.max(0, out.code_quality_score - 12);
    extra.push({ reason: `terminal · build FAILED · \`${buildFail.command}\` exit=${buildFail.exitCode}` });
    out.observations.unshift("Local build failed — reliability risk.");
  }

  if (tcPass) {
    out.code_quality_score = Math.min(100, out.code_quality_score + 4);
    extra.push({ reason: `terminal · typecheck OK · \`${tcPass.command}\` exit=0` });
  } else if (tcFail) {
    out.code_quality_score = Math.max(0, out.code_quality_score - 10);
    extra.push({ reason: `terminal · typecheck FAILED · \`${tcFail.command}\` exit=${tcFail.exitCode}` });
    out.observations.unshift("Local typecheck failed — likely typing issues.");
  }

  out.evidence = [...out.evidence, ...extra];
}

export async function runCodeQuality(state: MissionState): Promise<Handoff<CodeQualityOutput>> {
  if (!state.context_pack) throw new Error("code-quality: context_pack missing");

  const user = `Target role: ${state.target_role}

${buildContextBlock(state.context_pack)}

Return the JSON now.`;

  const res = await runAgentJson<CodeQualityOutput>({
    state,
    role: "worker",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 1800,
    fallback,
  });

  const out: CodeQualityOutput = { ...res.output, score_source: res.source };
  applyTerminalEvidence(state, out);
  out.assertion_results = deriveAssertionResults(state, out);

  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;
  state.scores.push({
    skill: "Code Quality",
    score: out.code_quality_score,
    evidence: out.evidence,
    confidence: res.source === "llm" ? 0.85 : res.source === "mock" ? 0.3 : 0.6,
    source: res.source,
    weaknesses: out.observations,
    assertion_ids: out.assertion_results.map((a) => a.assertion_id),
  });
  state.assertion_results.push(...(out.assertion_results ?? []));

  return {
    agent: "code-quality",
    completed: ["code_quality_analyzed"],
    unresolved: [],
    evidence: [
      ...out.evidence,
      { reason: `provider=${res.provider} model=${res.model}` },
    ],
    issues_found: out.observations,
    next_recommended: "testing",
    assertion_results: out.assertion_results,
    output: out,
  };
}
