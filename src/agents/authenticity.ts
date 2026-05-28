// Authenticity signals — deterministic checks plus optional LLM polish.
// Not plagiarism detection. Signals only.

import { runAgentJson } from "@/lib/providers/run-agent";
import type { AuthenticityOutput, Handoff, MissionState } from "./types";

const SYSTEM = `You are the Authenticity Signals agent of SkillProof AI.
You are NOT a plagiarism detector — you list authenticity signals only.
Return STRICT JSON:
{
  "authenticity_score": number (0-100),
  "confidence": number (0-1),
  "positive_signals": string[],
  "risk_signals": string[],
  "evidence": [{"file": string?, "reason": string}]
}
Use the provided deterministic signal summary. Adjust score modestly, do not invent claims.`;

const SCHEMA_HINT = '{"authenticity_score":number,"confidence":number,"positive_signals":string[],"risk_signals":string[],"evidence":[{"file":string?,"reason":string}]}';

function computeSignals(state: MissionState) {
  const pack = state.context_pack!;
  const positive: string[] = [];
  const risk: string[] = [];

  const commitCount = pack.commits.length;
  if (commitCount >= 15) positive.push(`Sustained commit history (${commitCount} sampled).`);
  else if (commitCount > 0 && commitCount < 5) risk.push(`Very few commits (${commitCount}) — single-shot risk.`);

  const vagueRe = /^(update|fix|wip|test|tmp|stuff|things|asdf|commit)\.?$/i;
  const vagueCount = pack.commits.filter((c) => vagueRe.test(c.message.split("\n")[0].trim())).length;
  const vagueRatio = commitCount ? vagueCount / commitCount : 0;
  if (vagueRatio > 0.5 && commitCount >= 3) risk.push(`>${Math.round(vagueRatio * 100)}% commits use vague messages.`);
  else if (commitCount >= 8 && vagueRatio < 0.2) positive.push("Most commit messages are descriptive.");

  if (commitCount === 1) risk.push("Single mega-commit detected — limits incremental signal.");

  const ageDays = (Date.now() - new Date(pack.meta.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays >= 30) positive.push(`Project age ~${Math.round(ageDays)} days.`);
  else if (ageDays < 3) risk.push(`Repo created very recently (~${Math.round(ageDays)} days ago).`);

  if (pack.filesIndex.tests.length > 0) positive.push(`${pack.filesIndex.tests.length} test files present.`);
  else risk.push("No test files found — common in copied templates.");

  const readme = pack.snippets.find((s) => s.path === pack.filesIndex.readme);
  if (readme) {
    if (/This is a Next\.js project bootstrapped with `create-next-app`/i.test(readme.content)) {
      risk.push("README appears to be the default create-next-app template.");
    }
    if (readme.content.length > 1500 && /## (Architecture|Design|How it works|Tech stack|Setup|Quick start)/i.test(readme.content)) {
      positive.push("README has project-specific sections.");
    }
  } else {
    risk.push("No README present.");
  }

  let score = 75;
  score -= risk.length * 8;
  score += positive.length * 4;
  score = Math.max(0, Math.min(100, score));

  return { positive, risk, score };
}

function fallback(state: MissionState): AuthenticityOutput {
  const { positive, risk, score } = computeSignals(state);
  return {
    authenticity_score: score,
    confidence: 0.65,
    positive_signals: positive,
    risk_signals: risk,
    evidence: [
      { reason: `Deterministic signals over ${state.context_pack!.commits.length} commits + repo meta.`, source: "deterministic" },
    ],
    score_source: "deterministic",
  };
}

export async function runAuthenticity(state: MissionState): Promise<Handoff<AuthenticityOutput>> {
  if (!state.context_pack) throw new Error("authenticity: context_pack missing");
  const baseline = fallback(state);

  const user = `Deterministic signal summary:
${JSON.stringify(baseline, null, 2)}

Commit messages (subject only):
${state.context_pack.commits.slice(0, 20).map((c) => "- " + c.message.split("\n")[0]).join("\n")}

Return JSON now.`;

  const res = await runAgentJson<AuthenticityOutput>({
    state,
    agentName: "authenticity",
    role: "worker",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 900,
  });

  const out: AuthenticityOutput = { ...res.output, score_source: res.source };

  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;
  state.authenticity = out;

  state.scores.push({
    skill: "Authenticity",
    score: out.authenticity_score,
    evidence: out.evidence,
    confidence: out.confidence ?? 0.65,
    source: res.source,
  });

  return {
    agent: "authenticity",
    completed: ["authenticity_signals_collected"],
    unresolved: [],
    evidence: [
      ...out.evidence,
      { reason: `provider=${res.provider} model=${res.model}` },
    ],
    issues_found: out.risk_signals,
    next_recommended: "interview-gen",
    output: out,
  };
}
