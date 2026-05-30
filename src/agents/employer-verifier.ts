import { composeAgentSystem } from "./prompt-policy";
import { runAgentJson } from "@/lib/providers/run-agent";
import { summarizeTerminalEvidence, getTerminalEvidence } from "@/lib/local-runner/evidence-analysis";
import type { EmployerVerifier, Handoff, MissionState, SkillGraphOutput } from "./types";

const SYSTEM = `You are the Employer Verifier agent for SkillProof AI.
Create an employer-safe hiring verifier from evidence only. Do not include raw prompts, private answers, raw terminal logs, raw model output, secrets, or admin traces.
Return STRICT JSON:
{
  "hiring_recommendation": "Strong shortlist" | "Consider with reservations" | "Needs more proof",
  "confidence": number,
  "top_verified_skills": string[],
  "biggest_risks": string[],
  "best_evidence": [{"file": string?, "reason": string}],
  "terminal_proof_summary": string?,
  "suggested_followup_questions": string[],
  "role_fit_summary": string,
  "shortlist_reason": string?,
  "caution_reason": string?
}`;

const SCHEMA_HINT = '{"hiring_recommendation":"Strong shortlist|Consider with reservations|Needs more proof","confidence":number,"top_verified_skills":string[],"biggest_risks":string[],"best_evidence":[{"file":string?,"reason":string}],"terminal_proof_summary":string?,"suggested_followup_questions":string[],"role_fit_summary":string,"shortlist_reason":string?,"caution_reason":string?}';

function rec(score: number): EmployerVerifier["hiring_recommendation"] {
  if (score >= 75) return "Strong shortlist";
  if (score >= 55) return "Consider with reservations";
  return "Needs more proof";
}

function normalize(state: MissionState, graph: SkillGraphOutput, raw: EmployerVerifier): EmployerVerifier {
  const recommendation = raw.hiring_recommendation ?? rec(graph.overall_score);
  const terminalSummary = summarizeTerminalEvidence(getTerminalEvidence(state));
  return {
    hiring_recommendation: recommendation,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0.7))),
    ownership_status: state.ownership_status ?? null,
    verification_level: "repo_only",
    execution_mode: state.execution_mode,
    top_verified_skills: (raw.top_verified_skills ?? graph.top_strengths).slice(0, 5),
    biggest_risks: [
      ...(raw.biggest_risks ?? []),
      ...(graph.not_measured.length ? [`Not measured: ${graph.not_measured.join(", ")}.`] : []),
    ].slice(0, 8),
    best_evidence: (raw.best_evidence?.length ? raw.best_evidence : graph.skill_graph.flatMap((s) => s.evidence.slice(0, 1))).slice(0, 8),
    terminal_proof_summary: raw.terminal_proof_summary ?? (terminalSummary.total ? terminalSummary.text : "no terminal evidence"),
    suggested_followup_questions: (raw.suggested_followup_questions?.length
      ? raw.suggested_followup_questions
      : [
          "Walk through the weakest verified skill area using code from this repo.",
          "Explain one failure mode and how you would test it.",
        ]).slice(0, 8),
    role_fit_summary: raw.role_fit_summary ?? `${recommendation} for ${state.target_role} at ${state.candidate_level} level.`,
    shortlist_reason: raw.shortlist_reason ?? (recommendation === "Strong shortlist" ? `Overall ${graph.overall_score}/100 with evidence-backed strengths.` : null),
    caution_reason: raw.caution_reason ?? (recommendation === "Strong shortlist" ? null : graph.growth_areas[0] ? `Needs more proof in ${graph.growth_areas[0]}.` : "Evidence depth is limited."),
  };
}

export async function runEmployerVerifier(state: MissionState, graph: SkillGraphOutput): Promise<Handoff<EmployerVerifier>> {
  const res = await runAgentJson<EmployerVerifier>({
    state,
    agentName: "employer-verifier",
    role: "profile",
    system: composeAgentSystem(SYSTEM),
    user: `Skill graph:\n${JSON.stringify(graph, null, 2)}\n\nOwnership:\n${JSON.stringify(state.ownership_status ?? null)}\n\nTerminal summary:\n${JSON.stringify(summarizeTerminalEvidence(getTerminalEvidence(state)))}\n\nReturn the employer-safe JSON now.`,
    schemaHint: SCHEMA_HINT,
    maxTokens: 1300,
    temperature: 0.1,
  });
  const out = normalize(state, graph, res.output);
  state.employerVerifier = out;
  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;
  return {
    agent: "employer-verifier",
    completed: ["employer_verifier_built"],
    unresolved: graph.not_measured.length ? [`Not measured: ${graph.not_measured.join(", ")}`] : [],
    evidence: [...out.best_evidence.slice(0, 5), { reason: `provider=${res.provider} model=${res.model}` }],
    issues_found: out.biggest_risks,
    next_recommended: "improvement-plan",
    output: out,
  };
}
