// Creator-verifier separation: this agent runs with FRESH CONTEXT.
// Truth set = every blob path in the repo tree (filesIndex.all), not just snippet paths.

import { extractJson, isMockMode, llmCall } from "@/lib/claude";
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

function fallback(state: MissionState): ValidatorOutput {
  const truthSet = new Set(state.context_pack?.filesIndex.all ?? []);
  const adjusted: ValidatorOutput["adjusted_scores"] = [];
  const hallucinated: string[] = [];
  let removed = 0;

  for (const claim of state.scores) {
    const badFiles = claim.evidence
      .map((e) => e.file)
      .filter((f): f is string => !!f && !truthSet.has(f));
    const noEvidence = claim.evidence.length === 0;

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
    } else if (claim.score > 85) {
      adjusted.push({
        skill: claim.skill,
        before: claim.score,
        after: 85,
        reason: "Capped to 85 without exceptional evidence.",
      });
    }
  }

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
  };
}

export async function runValidator(state: MissionState): Promise<Handoff<ValidatorOutput>> {
  let out: ValidatorOutput;
  let tin = 0, tout = 0;

  // Always run the deterministic baseline so unsupported claims are caught.
  const baseline = fallback(state);

  if (isMockMode()) {
    out = baseline;
  } else {
    const truth = state.context_pack?.filesIndex.all ?? [];
    // Cap truth set in prompt to avoid blowing tokens on huge repos.
    const sampledTruth = truth.length > 400
      ? [...truth.slice(0, 200), `... (${truth.length - 400} more) ...`, ...truth.slice(-200)]
      : truth;
    const claims = state.scores.map((c) => ({
      skill: c.skill,
      score: c.score,
      source: c.source,
      evidence: c.evidence,
    }));
    const user = `Repo file truth set (these are the only files that exist):
${sampledTruth.map((p) => "- " + p).join("\n")}

Score claims to audit:
${JSON.stringify(claims, null, 2)}

Heuristic baseline already computed:
${JSON.stringify(baseline, null, 2)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "validator", system: SYSTEM, user, maxTokens: 1800 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      const parsed = extractJson<ValidatorOutput>(r.text);
      out = parsed
        ? { ...parsed, assertion_coverage: parsed.assertion_coverage ?? [], hallucinated_files: parsed.hallucinated_files ?? [] }
        : baseline;
    } catch {
      out = baseline;
    }
  }

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

  // Roll up assertion coverage from agents that produced any.
  const coverage: ValidationAssertionResult[] = [];
  const seen = new Set<string>();
  for (const r of state.assertion_results) {
    if (!seen.has(r.assertion_id)) {
      coverage.push(r);
      seen.add(r.assertion_id);
    }
  }
  // Any contract assertion not covered → unknown.
  if (state.contract) {
    for (const a of state.contract.assertions) {
      if (!seen.has(a.id)) {
        coverage.push({
          assertion_id: a.id,
          dimension: a.dimension,
          status: "unknown",
          evidence: [],
          responsible_agent: "validator",
          notes: "No agent reported on this assertion.",
        });
      }
    }
  }
  out.assertion_coverage = coverage;

  state.tokens_in += tin;
  state.tokens_out += tout;

  return {
    agent: "validator",
    completed: ["claims_audited", "scores_adjusted", "assertion_coverage_built"],
    unresolved: [],
    evidence: out.notes.map((n) => ({ reason: n })),
    issues_found: out.adjusted_scores.map((a) => `${a.skill}: ${a.before} → ${a.after} (${a.reason})`),
    next_recommended: "skill-graph",
    assertion_results: out.assertion_coverage,
    output: out,
  };
}
