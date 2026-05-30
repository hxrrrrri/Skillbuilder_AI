import { composeAgentSystem } from "./prompt-policy";
// Creator-verifier separation: this agent runs with FRESH CONTEXT.
// Truth set = every blob path in the repo tree (filesIndex.all), not just snippet paths.

import { runAgentJson } from "@/lib/providers/run-agent";
import { validateEvidenceAgainstContext } from "@/lib/evidence";
import type {
  Handoff,
  MissionState,
  ValidationAssertionResult,
  ValidatorOutput,
} from "./types";

const SYSTEM = `You are the Validator agent of SkillProof AI. FRESH CONTEXT.
Adversarial by design. Every score must cite real files from the truth set.
Return STRICT JSON:
{
  "validated": boolean,
  "confidence": number (0-1),
  "unsupported_claims_removed": number,
  "adjusted_scores": [
    {"skill": string, "before": number, "after": number, "reason": string}
  ],
  "hallucinated_files": string[],
  "notes": string[]
}
Rules:
- If a score has 0 evidence items, lower it toward 50 with a note.
- If evidence references a file NOT in the truth set, flag the claim hallucinated.
- Never raise scores. Only lower or leave alone.
- Cap > 85 unless evidence is exceptional.`;

const SCHEMA_HINT = '{"validated":boolean,"confidence":number,"unsupported_claims_removed":number,"adjusted_scores":[{"skill":string,"before":number,"after":number,"reason":string}],"hallucinated_files":string[],"notes":string[]}';

function fallback(state: MissionState): ValidatorOutput {
  const adjusted: ValidatorOutput["adjusted_scores"] = [];
  const hallucinated: string[] = [];
  let removed = 0;

  for (const claim of state.scores) {
    const validatedEvidence = validateEvidenceAgainstContext(claim.evidence, state.context_pack);
    const badFiles = validatedEvidence
      .filter((e) => e.file && !e.valid)
      .map((e) => e.file!) ;
    const noEvidence = claim.evidence.length === 0;
    const noValidEvidence = !noEvidence && validatedEvidence.every((e) => !e.valid);

    if (noEvidence) {
      adjusted.push({
        skill: claim.skill,
        before: claim.score,
        after: Math.min(claim.score, 55),
        reason: "No evidence cited.",
      });
      removed += 1;
    } else if (badFiles.length) {
      hallucinated.push(...badFiles);
      adjusted.push({
        skill: claim.skill,
        before: claim.score,
        after: Math.max(40, claim.score - 15),
        reason: `Evidence references files not in repo tree: ${badFiles.slice(0, 3).join(", ")}.`,
      });
      removed += 1;
    } else if (noValidEvidence) {
      adjusted.push({
        skill: claim.skill,
        before: claim.score,
        after: Math.min(claim.score, 60),
        reason: "Evidence exists but could not be verified by file/source/hash checks.",
      });
      removed += 1;
    } else if (claim.score > 85) {
      adjusted.push({
        skill: claim.skill,
        before: claim.score,
        after: 85,
        reason: "Capped to 85 without exceptional evidence.",
      });
    }
    claim.evidence = validatedEvidence.map(({ valid, validator_note, ...e }) => ({
      ...e,
      validator_note,
      confidence: valid ? e.confidence ?? 0.8 : Math.min(e.confidence ?? 0.4, 0.4),
    }));
  }

  const assertionCounts = { passed: 0, failed: 0, partial: 0, unknown: 0 };
  for (const r of state.assertion_results) {
    assertionCounts[r.status] += 1;
  }
  const totalAssertions = state.contract?.assertions.length ?? state.assertion_results.length;
  const coveredAssertions = state.assertion_results.filter((r) => r.evidence.length > 0).length;

  return {
    validated: removed === 0,
    confidence: removed === 0 ? 0.85 : 0.7,
    unsupported_claims_removed: removed,
    adjusted_scores: adjusted,
    hallucinated_files: [...new Set(hallucinated)],
    notes: removed === 0
      ? ["All claims grounded in evidence within repo tree."]
      : [`Removed/lowered ${removed} unsupported claims.`],
    assertion_coverage: [],
    assertion_coverage_summary: {
      total: totalAssertions,
      passed: assertionCounts.passed,
      failed: assertionCounts.failed,
      partial: assertionCounts.partial,
      unknown: Math.max(assertionCounts.unknown, totalAssertions - state.assertion_results.length),
      evidence_coverage_percentage: totalAssertions > 0
        ? Math.round((coveredAssertions / totalAssertions) * 100)
        : 0,
    },
  };
}

export async function runValidator(state: MissionState): Promise<Handoff<ValidatorOutput>> {
  // Always run the deterministic baseline so unsupported claims are caught.
  const baseline = fallback(state);

  const user = `Deterministic evidence audit already computed:
${JSON.stringify(baseline, null, 2)}

Use the compact claim table and focused snippets to review the audit. Return the JSON now.`;

  const res = await runAgentJson<ValidatorOutput>({
    state,
    agentName: "validator",
    role: "validator",
    system: composeAgentSystem(SYSTEM),
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 1800,
    useSelectedContext: true,
  });

  const out: ValidatorOutput = {
    ...res.output,
    assertion_coverage: res.output.assertion_coverage ?? [],
    hallucinated_files: res.output.hallucinated_files ?? [],
    assertion_coverage_summary: res.output.assertion_coverage_summary ?? baseline.assertion_coverage_summary,
  };
  const mergedAdjustments = [...baseline.adjusted_scores];
  for (const adj of out.adjusted_scores ?? []) {
    if (!mergedAdjustments.some((a) => a.skill === adj.skill && a.reason === adj.reason)) mergedAdjustments.push(adj);
  }
  out.adjusted_scores = mergedAdjustments;
  out.hallucinated_files = Array.from(new Set([...(baseline.hallucinated_files ?? []), ...(out.hallucinated_files ?? [])]));
  out.unsupported_claims_removed = Math.max(out.unsupported_claims_removed ?? 0, baseline.unsupported_claims_removed);

  // Apply adjustments back to state.scores. Never raise.
  for (const adj of out.adjusted_scores) {
    const target = state.scores.find((s) => s.skill === adj.skill);
    if (target) {
      if (adj.after < target.score) target.score = adj.after;
      if (!target.evidence.length) {
        target.evidence.push({ reason: `Validator note: ${adj.reason}` });
      }
      target.confidence = Math.min(target.confidence ?? 0.8, 0.65);
    }
  }

  // Roll up assertion coverage from agents.
  const coverage: ValidationAssertionResult[] = [];
  const seen = new Set<string>();
  for (const r of state.assertion_results) {
    if (!seen.has(r.assertion_id)) {
      coverage.push(r);
      seen.add(r.assertion_id);
    }
  }
  if (state.contract) {
    for (const a of state.contract.assertions) {
      if (!seen.has(a.id)) {
        coverage.push({
          assertion_id: a.id,
          dimension: a.dimension,
          status: "unknown",
          confidence: 0,
          evidence: [],
          responsible_agent: "validator",
          notes: "No agent reported on this assertion.",
        });
      }
    }
  }
  out.assertion_coverage = coverage;
  const counts = { passed: 0, failed: 0, partial: 0, unknown: 0 };
  for (const c of coverage) counts[c.status] += 1;
  const withEvidence = coverage.filter((c) => c.evidence.length > 0).length;
  out.assertion_coverage_summary = {
    total: coverage.length,
    passed: counts.passed,
    failed: counts.failed,
    partial: counts.partial,
    unknown: counts.unknown,
    evidence_coverage_percentage: coverage.length ? Math.round((withEvidence / coverage.length) * 100) : 0,
  };

  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;

  return {
    agent: "validator",
    completed: ["claims_audited", "scores_adjusted", "assertion_coverage_built"],
    unresolved: [],
    evidence: [
      ...out.notes.map((n) => ({ reason: n })),
      { reason: `provider=${res.provider} model=${res.model}` },
    ],
    issues_found: out.adjusted_scores.map((a) => `${a.skill}: ${a.before} → ${a.after} (${a.reason})`),
    next_recommended: "skill-graph",
    assertion_results: out.assertion_coverage,
    output: out,
  };
}
