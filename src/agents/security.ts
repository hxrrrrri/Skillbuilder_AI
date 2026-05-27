import { runAgentJson } from "@/lib/providers/run-agent";
import { buildContextBlock } from "./_analysis";
import { getTerminalEvidence } from "@/lib/local-runner/evidence-analysis";
import { hydrateEvidenceFromContext } from "@/lib/evidence";
import { assertionResultsForDimension } from "./assertions";
import type { Evidence, Handoff, MissionState, SecurityOutput, ValidationAssertionResult } from "./types";

const SYSTEM = `You are the Security Awareness agent of SkillProof AI.
Light static review — flag obvious risks visible in the provided snippets. Do not invent CVEs.
Return STRICT JSON:
{
  "security_score": number (0-100),
  "findings": [{"severity": "low"|"med"|"high", "note": string, "file": string?}],
  "evidence": [{"file": string, "reason": string}]
}`;

const SCHEMA_HINT = '{"security_score":number,"findings":[{"severity":"low|med|high","note":string,"file":string?}],"evidence":[{"file":string,"reason":string}]}';

function looksLikeSecret(snippet: string): boolean {
  return (
    /sk-[a-zA-Z0-9]{20,}/.test(snippet) ||
    /AKIA[0-9A-Z]{16}/.test(snippet) ||
    /ghp_[A-Za-z0-9]{20,}/.test(snippet) ||
    /-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----/.test(snippet)
  );
}

function fallback(state: MissionState): SecurityOutput {
  const findings: SecurityOutput["findings"] = [];
  for (const s of state.context_pack!.snippets) {
    if (looksLikeSecret(s.content)) {
      findings.push({ severity: "high", note: "Possible committed secret pattern.", file: s.path });
    }
  }
  return {
    security_score: findings.length ? 35 : 60,
    findings,
    evidence: [
      { file: state.context_pack!.snippets[0]?.path, reason: `Scanned ${state.context_pack!.snippets.length} snippets for obvious secret patterns.` },
    ],
    score_source: "heuristic",
  };
}

function deriveAssertionResults(state: MissionState, out: SecurityOutput): ValidationAssertionResult[] {
  const high = out.findings.some((f) => f.severity === "high");
  const hasValidationSignals = (state.context_pack?.intelligence?.schemas.length ?? 0) > 0;
  return assertionResultsForDimension({
    state,
    dimension: "security",
    agent: "security",
    evidence: out.evidence,
    passed: (a) => /input|validated|validation/i.test(a.statement) ? hasValidationSignals : !high,
    failed: () => high,
    partial: () => out.security_score >= 45,
    baseNote: out.findings.length ? `${out.findings.length} security findings.` : "No high-severity static or terminal findings.",
  });
}

// Roll in terminal-derived security findings (grep hits surfaced by proof-runner).
function applyTerminalEvidence(state: MissionState, out: SecurityOutput) {
  const evidence = getTerminalEvidence(state, "security");
  const extra: Evidence[] = [];
  for (const e of evidence) {
    if (e.exitCode === 0 && (e.stdoutSummary || "").trim().length > 0) {
      out.findings.push({
        severity: "med",
        note: `terminal grep: ${e.command} — see stdout`,
      });
      out.security_score = Math.max(0, out.security_score - 6);
      extra.push({ reason: `terminal · security · ${e.command}`, snippet: e.stdoutSummary.slice(0, 200), source: "terminal" });
    }
  }
  if (extra.length) out.evidence = [...out.evidence, ...extra];
}

export async function runSecurity(state: MissionState): Promise<Handoff<SecurityOutput>> {
  if (!state.context_pack) throw new Error("security: context_pack missing");

  const user = `${buildContextBlock(state.context_pack)}

Return the JSON now.`;

  const res = await runAgentJson<SecurityOutput>({
    state,
    role: "worker",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 1500,
    fallback: () => fallback(state),
  });

  const out: SecurityOutput = { ...res.output, score_source: res.source };
  out.evidence = hydrateEvidenceFromContext(out.evidence ?? [], state.context_pack, res.source === "llm" ? "llm" : "heuristic");
  applyTerminalEvidence(state, out);
  out.assertion_results = deriveAssertionResults(state, out);

  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;
  state.scores.push({
    skill: "Security",
    score: out.security_score,
    evidence: out.evidence,
    confidence: res.source === "llm" ? 0.85 : 0.6,
    source: res.source,
    assertion_ids: out.assertion_results.map((a) => a.assertion_id),
  });
  state.assertion_results.push(...(out.assertion_results ?? []));

  return {
    agent: "security",
    completed: ["security_reviewed"],
    unresolved: [],
    evidence: [
      ...out.evidence,
      { reason: `provider=${res.provider} model=${res.model}` },
    ],
    issues_found: out.findings.map((f) => `[${f.severity}] ${f.note}${f.file ? ` (${f.file})` : ""}`),
    next_recommended: "git-evidence",
    assertion_results: out.assertion_results,
    output: out,
  };
}
