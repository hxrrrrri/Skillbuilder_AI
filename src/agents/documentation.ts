import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import type {
  DocumentationOutput,
  Handoff,
  MissionState,
  ValidationAssertionResult,
} from "./types";

const SYSTEM = `You are the Documentation agent of SkillProof AI.
Judge documentation quality from the README only.
Return STRICT JSON:
{
  "documentation_score": number (0-100),
  "has_readme": boolean,
  "readme_specificity": number (0-100),
  "evidence": [{"file": string, "reason": string}]
}
Reward project-specific content (how to run, what it does, design decisions). Penalize template boilerplate.`;

function specificity(readme: string | null): number {
  if (!readme) return 0;
  let score = 30;
  if (/## (Getting Started|Setup|Installation|Quick start|Run)/i.test(readme)) score += 15;
  if (/## (Architecture|Design|How it works|Tech stack)/i.test(readme)) score += 15;
  if (/```(bash|sh|js|ts)/i.test(readme)) score += 10;
  if (/(npm|pnpm|yarn|bun|pip|cargo|go) (install|run|start)/i.test(readme)) score += 10;
  if (/\bThis is a Next\.js project bootstrapped with `create-next-app`\b/i.test(readme)) score -= 25;
  if (readme.length > 2000) score += 10;
  return Math.max(0, Math.min(100, score));
}

function fallback(state: MissionState): DocumentationOutput {
  const readmeSnippet = state.context_pack?.snippets.find(
    (s) => s.path === state.context_pack?.filesIndex.readme
  );
  const text = readmeSnippet?.content ?? null;
  const spec = specificity(text);
  const has = !!text;
  const score = has ? Math.round(0.4 * spec + (text!.length > 500 ? 50 : 25)) : 20;
  return {
    documentation_score: Math.min(100, score),
    has_readme: has,
    readme_specificity: spec,
    evidence: has
      ? [{ file: state.context_pack?.filesIndex.readme ?? "README", reason: `Specificity ${spec}/100, length ${text!.length} chars.` }]
      : [{ reason: "No README detected by scanner." }],
    score_source: "heuristic",
  };
}

function deriveAssertionResults(state: MissionState, out: DocumentationOutput): ValidationAssertionResult[] {
  const contract = state.contract;
  if (!contract) return [];
  return contract.assertions
    .filter((a) => a.dimension === "documentation")
    .map((a) => ({
      assertion_id: a.id,
      dimension: a.dimension,
      statement: a.statement,
      status: out.has_readme && out.documentation_score >= 55 ? "passed"
        : out.has_readme ? "partial" : "failed",
      evidence: out.evidence,
      responsible_agent: "documentation",
      notes: out.has_readme ? "README present." : "No README found.",
    }) as ValidationAssertionResult);
}

export async function runDocumentation(state: MissionState): Promise<Handoff<DocumentationOutput>> {
  if (!state.context_pack) throw new Error("documentation: context_pack missing");
  let out: DocumentationOutput;
  let tin = 0, tout = 0;

  if (isMockMode()) {
    out = { ...fallback(state), score_source: state.mock_mode ? "mock" : "heuristic" };
  } else {
    const readmeSnippet = state.context_pack.snippets.find(
      (s) => s.path === state.context_pack?.filesIndex.readme
    );
    const user = `README path: ${state.context_pack.filesIndex.readme ?? "(none)"}
README content (truncated to 4k chars):
${(readmeSnippet?.content ?? "(none)").slice(0, 4000)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "worker", system: SYSTEM, user, maxTokens: 800 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      const parsed = extractJson<DocumentationOutput>(r.text);
      out = parsed ? { ...parsed, score_source: "llm" } : { ...fallback(state), score_source: "heuristic" };
    } catch {
      out = { ...fallback(state), score_source: "heuristic" };
    }
  }

  out.assertion_results = deriveAssertionResults(state, out);

  state.tokens_in += tin;
  state.tokens_out += tout;
  state.scores.push({
    skill: "Documentation",
    score: out.documentation_score,
    evidence: out.evidence,
    confidence: out.score_source === "llm" ? 0.8 : 0.65,
    source: out.score_source ?? "heuristic",
    assertion_ids: out.assertion_results.map((a) => a.assertion_id),
  });
  state.assertion_results.push(...(out.assertion_results ?? []));

  return {
    agent: "documentation",
    completed: ["documentation_analyzed"],
    unresolved: [],
    evidence: out.evidence,
    issues_found: out.documentation_score < 50 ? ["Documentation thin or templated."] : [],
    next_recommended: "authenticity",
    assertion_results: out.assertion_results,
    output: out,
  };
}
