// Shared, evidence-gated prompt policy for every LLM agent.
//
// These constants are appended to each agent's base system prompt (at runtime
// and at seed time) so the whole pipeline enforces one strict contract: JSON
// only, no score without evidence, not_measured over guessing, token thrift,
// supplied context only, and redaction. Keep them TIGHT — they ride on every
// prompt, so every extra sentence is spent on every agent call.
//
// NOTE: agent base prompts keep their `const SYSTEM = \`...\`` template literal
// (seed-prompts.ts regex-extracts it). The policy is composed AROUND that base
// via composeAgentSystem(), never interpolated inside the template.

export const COMMON_AGENT_RULES = [
  "OUTPUT: strict minified-friendly JSON only. No markdown, prose, or code fences around it.",
  "Use ONLY the supplied context. Never invent files, commits, scores, CVEs, or terminal/ownership proof.",
  "Do not repeat or echo the repo context back. Be concise; respect the token budget.",
  "Every output must end with the schema's next-action / next_recommended field when present.",
].join("\n");

export const EVIDENCE_RULES = [
  "EVIDENCE: no score without evidence. Every claim cites a file_path from the snippets,",
  "with line_start/line_end when known, plus source and a confidence 0..1.",
  "Tag each evidence item's source: llm | terminal | github_api | local_clone | deterministic.",
  "If you cannot cite supplied context for a claim, drop the claim or lower confidence — do not assert it.",
].join("\n");

export const TOKEN_BUDGET_RULES = [
  "TOKENS: answer in the fewest tokens that are still complete and correct.",
  "Never request more context or a full repo/file dump. Work from the provided snippets only.",
].join("\n");

export const NOT_MEASURED_RULES = [
  "NOT MEASURED: if evidence is missing or insufficient, return not_measured (or cap the score and say why).",
  "Never fill an un-evidenced dimension with a default like 50. Absence of proof is not a mid score.",
].join("\n");

export const SECURITY_REDACTION_RULES = [
  "REDACTION: never emit secrets, API keys, tokens, .env values, private keys, or raw terminal/log text.",
  "Reference a detected secret by file + type only; never reproduce its value.",
].join("\n");

/** Full policy block, ordered. Appended after the agent's base instructions. */
export const AGENT_PROMPT_POLICY = [
  "— SHARED AGENT CONTRACT (binding) —",
  COMMON_AGENT_RULES,
  EVIDENCE_RULES,
  NOT_MEASURED_RULES,
  TOKEN_BUDGET_RULES,
  SECURITY_REDACTION_RULES,
].join("\n");

const POLICY_MARKER = "— SHARED AGENT CONTRACT (binding) —";

/**
 * Compose an agent system prompt: base instructions + the shared contract.
 * Idempotent — if the base already carries the contract, it is returned as-is
 * (prevents double-application when a seeded prompt is fed back through).
 */
export function composeAgentSystem(base: string): string {
  const trimmed = (base ?? "").trim();
  if (trimmed.includes(POLICY_MARKER)) return trimmed;
  return `${trimmed}\n\n${AGENT_PROMPT_POLICY}`;
}

export function hasAgentPolicy(text: string): boolean {
  return typeof text === "string" && text.includes(POLICY_MARKER);
}
