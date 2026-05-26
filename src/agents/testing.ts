import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import { buildContextBlock } from "./_analysis";
import type { Handoff, MissionState, TestingOutput } from "./types";

const SYSTEM = `You are the Testing & Reliability agent of SkillProof AI.
Use ONLY the provided file index and snippets. Return STRICT JSON:
{
  "testing_score": number (0-100),
  "test_count": number,
  "has_e2e": boolean,
  "has_ci": boolean,
  "evidence": [{"file": string, "reason": string}]
}
Score considerations:
- Test count vs total files.
- Presence of unit, integration, e2e tiers.
- CI workflow that actually runs tests.
- Test quality of any sampled snippet (real assertions vs trivial render checks).
Penalize if tests are absent. Do NOT inflate based on intent — only on evidence.`;

function fallback(state: MissionState): TestingOutput {
  const pack = state.context_pack!;
  return {
    testing_score: pack.filesIndex.tests.length === 0 ? 25 : 55,
    test_count: pack.filesIndex.tests.length,
    has_e2e: pack.filesIndex.tests.some((p) => /e2e|cypress|playwright/i.test(p)),
    has_ci: pack.detected.hasCI,
    evidence: [
      { reason: `${pack.filesIndex.tests.length} test files detected by scanner.` },
      { reason: pack.detected.hasCI ? "CI workflow present." : "No CI workflow detected." },
    ],
  };
}

export async function runTesting(state: MissionState): Promise<Handoff<TestingOutput>> {
  if (!state.context_pack) throw new Error("testing: context_pack missing");
  let out: TestingOutput;
  let tin = 0,
    tout = 0;

  if (isMockMode()) {
    out = fallback(state);
  } else {
    const user = `${buildContextBlock(state.context_pack)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "worker", system: SYSTEM, user, maxTokens: 1200 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      out = extractJson<TestingOutput>(r.text) ?? fallback(state);
    } catch {
      out = fallback(state);
    }
  }

  state.tokens_in += tin;
  state.tokens_out += tout;
  state.scores.push({
    skill: "Testing",
    score: out.testing_score,
    evidence: out.evidence,
  });

  return {
    agent: "testing",
    completed: ["testing_analyzed"],
    unresolved: [],
    evidence: out.evidence,
    issues_found: out.testing_score < 50 ? ["Testing coverage looks weak."] : [],
    next_recommended: "security",
    output: out,
  };
}
