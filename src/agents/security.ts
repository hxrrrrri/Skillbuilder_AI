import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import { buildContextBlock } from "./_analysis";
import type { Handoff, MissionState, SecurityOutput } from "./types";

const SYSTEM = `You are the Security Awareness agent of SkillProof AI.
Light static review only — flag obvious risks visible in the provided snippets. Do not invent CVEs.
Return STRICT JSON:
{
  "security_score": number (0-100),
  "findings": [{"severity": "low"|"med"|"high", "note": string, "file": string?}],
  "evidence": [{"file": string, "reason": string}]
}
Check for: committed secrets, hardcoded API keys, unsafe eval, missing input validation at boundaries,
overly permissive CORS, weak auth patterns, SQL string concatenation, dangerous deserialization.`;

function looksLikeSecret(snippet: string): boolean {
  // simple heuristic patterns
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
    security_score: findings.length ? 35 : 65,
    findings,
    evidence: [
      { reason: `Scanned ${state.context_pack!.snippets.length} snippets for obvious secret patterns.` },
    ],
  };
}

export async function runSecurity(state: MissionState): Promise<Handoff<SecurityOutput>> {
  if (!state.context_pack) throw new Error("security: context_pack missing");
  let out: SecurityOutput;
  let tin = 0,
    tout = 0;

  if (isMockMode()) {
    out = fallback(state);
  } else {
    const user = `${buildContextBlock(state.context_pack)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "worker", system: SYSTEM, user, maxTokens: 1500 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      out = extractJson<SecurityOutput>(r.text) ?? fallback(state);
    } catch {
      out = fallback(state);
    }
  }

  state.tokens_in += tin;
  state.tokens_out += tout;
  state.scores.push({
    skill: "Security",
    score: out.security_score,
    evidence: out.evidence,
  });

  return {
    agent: "security",
    completed: ["security_reviewed"],
    unresolved: [],
    evidence: out.evidence,
    issues_found: out.findings.map((f) => `[${f.severity}] ${f.note}${f.file ? ` (${f.file})` : ""}`),
    next_recommended: "git-evidence",
    output: out,
  };
}
