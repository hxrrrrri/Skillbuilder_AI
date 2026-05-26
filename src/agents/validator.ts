// Creator-verifier separation: this agent runs with FRESH CONTEXT.
// It receives ONLY the score claims + evidence, never the prior agents' chain-of-thought.
// Its job: detect unsupported claims, hallucinated files, inflated/deflated scores.

import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import type { Handoff, MissionState, ValidatorOutput } from "./types";

const SYSTEM = `You are the Validator agent of SkillProof AI. You have FRESH CONTEXT.
You are adversarial by design: every score must be backed by evidence that names real files from the repo file index.
Return STRICT JSON:
{
  "validated": boolean,
  "confidence": number (0-1),
  "unsupported_claims_removed": number,
  "adjusted_scores": [
    {"skill": string, "before": number, "after": number, "reason": string}
  ],
  "notes": string[]
}
Rules:
- If a score has 0 evidence items, mark it unsupported and pull it down toward 50 with a note.
- If evidence references a file NOT in the provided file index, flag the claim as hallucinated.
- Do not raise scores. You can only lower them or leave them alone.
- Do not trust scores >85 unless evidence is unusually strong.`;

function fallback(state: MissionState): ValidatorOutput {
  const validIndex = new Set(state.context_pack?.snippets.map((s) => s.path) ?? []);
  const adjusted: ValidatorOutput["adjusted_scores"] = [];
  let removed = 0;
  for (const claim of state.scores) {
    const hallucinated = claim.evidence.some((e) => e.file && !validIndex.has(e.file));
    const noEvidence = claim.evidence.length === 0;
    if (noEvidence) {
      adjusted.push({ skill: claim.skill, before: claim.score, after: Math.min(claim.score, 55), reason: "No evidence cited." });
      removed += 1;
    } else if (hallucinated) {
      adjusted.push({
        skill: claim.skill,
        before: claim.score,
        after: Math.max(40, claim.score - 15),
        reason: "Evidence references files not in repo index.",
      });
      removed += 1;
    } else if (claim.score > 85) {
      adjusted.push({ skill: claim.skill, before: claim.score, after: 85, reason: "Capped to 85 without exceptional evidence." });
    }
  }
  return {
    validated: removed === 0,
    confidence: removed === 0 ? 0.88 : 0.72,
    unsupported_claims_removed: removed,
    adjusted_scores: adjusted,
    notes: removed === 0 ? ["All claims grounded in evidence."] : [`Removed/lowered ${removed} unsupported claims.`],
  };
}

export async function runValidator(state: MissionState): Promise<Handoff<ValidatorOutput>> {
  let out: ValidatorOutput;
  let tin = 0,
    tout = 0;

  if (isMockMode()) {
    out = fallback(state);
  } else {
    // Fresh context: send ONLY score claims + file index, not prior agent reasoning.
    const fileIndex = state.context_pack?.snippets.map((s) => s.path) ?? [];
    const claims = state.scores.map((c) => ({
      skill: c.skill,
      score: c.score,
      evidence: c.evidence,
    }));
    const user = `Repo file index (truth set — only these files exist):
${fileIndex.map((p) => "- " + p).join("\n")}

Score claims to audit:
${JSON.stringify(claims, null, 2)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "validator", system: SYSTEM, user, maxTokens: 1800 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      out = extractJson<ValidatorOutput>(r.text) ?? fallback(state);
    } catch {
      out = fallback(state);
    }
  }

  // Apply adjustments back to state.scores.
  for (const adj of out.adjusted_scores) {
    const target = state.scores.find((s) => s.skill === adj.skill);
    if (target) {
      target.score = adj.after;
      if (!target.evidence.length) {
        target.evidence.push({ reason: `Validator note: ${adj.reason}` });
      }
    }
  }

  state.tokens_in += tin;
  state.tokens_out += tout;

  return {
    agent: "validator",
    completed: ["claims_audited", "scores_adjusted"],
    unresolved: [],
    evidence: out.notes.map((n) => ({ reason: n })),
    issues_found: out.adjusted_scores.map((a) => `${a.skill}: ${a.before} → ${a.after} (${a.reason})`),
    next_recommended: "skill-graph",
    output: out,
  };
}
