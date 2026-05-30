import { composeAgentSystem } from "./prompt-policy";
import { runAgentJson } from "@/lib/providers/run-agent";
import { summarizeTerminalEvidence, hasPassingCommand, hasFailingCommand, getTerminalEvidence } from "@/lib/local-runner/evidence-analysis";
import type {
  EmployerVerifier,
  Handoff,
  ImprovementPlan,
  MissionState,
  ProfileOutput,
  SkillGraphOutput,
} from "./types";

const SYSTEM = `You are the Profile Generator agent of SkillProof AI.
Produce a recruiter-readable verified profile from the skill graph and evidence.
Return STRICT JSON:
{
  "developer_summary": string (2-3 sentences),
  "verified_skills": string[],
  "improvement_areas": string[],
  "employer_recommendation": string (1-2 sentences),
  "evidence_highlights": [{"file": string?, "reason": string}],
  "employer_verifier": {
    "hiring_recommendation": "Strong shortlist" | "Consider with reservations" | "Needs more proof",
    "top_verified_skills": string[],
    "biggest_risks": string[],
    "best_evidence": [{"file": string?, "reason": string}],
    "suggested_followup_questions": string[],
    "role_fit_summary": string
  },
  "improvement_plan": {
    "seven_day": string[],
    "thirty_day": [{"week": number, "title": string, "detail": string, "files": string[]?}],
    "recommended_tests": string[],
    "git_hygiene": string[]
  }
}
Tone: factual, evidence-grounded, no hype.`;

const SCHEMA_HINT = '{"developer_summary":string,"verified_skills":string[],"improvement_areas":string[],"employer_recommendation":string,"evidence_highlights":[{"file":string?,"reason":string}],"employer_verifier":{...},"improvement_plan":{...}}';

function hiringRecFromScore(score: number): EmployerVerifier["hiring_recommendation"] {
  if (score >= 75) return "Strong shortlist";
  if (score >= 55) return "Consider with reservations";
  return "Needs more proof";
}

function fallbackImprovementPlan(state: MissionState, graph: SkillGraphOutput): ImprovementPlan {
  const pack = state.context_pack;
  const filesForTests = (pack?.filesIndex.important ?? []).slice(0, 3);
  const lacksTests = graph.skill_graph.find((s) => s.name === "Testing" && (s.score ?? 0) < 60);
  const lacksCI = !pack?.detected.hasCI;
  const lacksDocs = graph.skill_graph.find((s) => s.name === "Documentation" && (s.score ?? 0) < 60);

  return {
    seven_day: [
      lacksTests ? "Add at least one unit test per critical utility." : "Add an integration test for a route handler.",
      "Clean up any vague commit messages on next push (conventional commits).",
      lacksDocs ? "Expand README with project-specific Setup + Architecture sections." : "Document one tricky decision in README.",
    ],
    thirty_day: [
      { week: 1, title: "Tests for utilities", detail: "Cover at least 3 helper functions with assertions.", files: filesForTests },
      { week: 2, title: lacksCI ? "Add CI workflow" : "Tighten CI", detail: lacksCI ? "Add .github/workflows/ci.yml running tests on PR." : "Cache deps, add type-check job." },
      { week: 3, title: "Refactor god file", detail: "Split the largest file in src/ into modules with single responsibilities." },
      { week: 4, title: "Error boundaries + input validation", detail: "Add zod or equivalent at all external boundaries." },
    ],
    recommended_tests: filesForTests.map((f) => `Add tests for ${f}.`),
    git_hygiene: [
      "Use conventional commit prefixes (feat:, fix:, chore:).",
      "Avoid single mega-commits — prefer small, reviewable diffs.",
    ],
  };
}

// Augment Employer Verifier with local proof + ownership context.
function augmentEmployerVerifier(
  state: MissionState,
  graph: SkillGraphOutput,
  base: EmployerVerifier,
): EmployerVerifier {
  const out: EmployerVerifier = { ...base };
  out.ownership_status = state.ownership_status ?? null;
  out.execution_mode = state.execution_mode ?? null;
  out.verification_level = state.context_pack ? "repo_only" : "unknown";

  const terminal = getTerminalEvidence(state);
  const summary = summarizeTerminalEvidence(terminal);
  out.terminal_proof_summary = terminal.length ? summary.text : "no terminal evidence";

  const risks = [...(out.biggest_risks ?? [])];
  const evidence = [...(out.best_evidence ?? [])];

  if (state.execution_mode === "cli" || state.execution_mode === "hybrid") {
    const testPass = hasPassingCommand(terminal, "testing");
    const testFail = hasFailingCommand(terminal, "testing");
    const buildPass = hasPassingCommand(terminal, "build");
    const buildFail = hasFailingCommand(terminal, "build");
    const tcPass = hasPassingCommand(terminal, "typecheck");
    const tcFail = hasFailingCommand(terminal, "typecheck");

    if (testPass) evidence.unshift({ reason: `Local tests passed: \`${testPass.command}\`` });
    if (buildPass) evidence.unshift({ reason: `Local build succeeded: \`${buildPass.command}\`` });
    if (tcPass) evidence.unshift({ reason: `Local typecheck passed: \`${tcPass.command}\`` });

    if (testFail) risks.unshift(`Local tests failed: \`${testFail.command}\` exit=${testFail.exitCode}`);
    if (buildFail) risks.unshift(`Local build failed: \`${buildFail.command}\` exit=${buildFail.exitCode}`);
    if (tcFail) risks.unshift(`Local typecheck failed: \`${tcFail.command}\` exit=${tcFail.exitCode}`);
  }

  // Ownership trust signals.
  const ownership = state.ownership_status;
  if (ownership) {
    if (ownership.confidence === "verified") {
      evidence.unshift({ reason: `Ownership verified (${ownership.owner_match ? "gh user match" : "repo token match"}).` });
    } else if (ownership.confidence === "self_declared") {
      risks.push(`Identity self-declared as @${ownership.github_username} — not verified.`);
    } else {
      risks.push("No ownership verification — repo analyzed anonymously.");
    }
  }

  // Interview status.
  const interviewHandoff = state.handoffs.find((h) => h.agent === "interview-gen");
  const hasInterview = !!interviewHandoff;
  if (!hasInterview) {
    out.suggested_followup_questions = [
      ...(out.suggested_followup_questions ?? []),
      "No interview answered yet — only repo-only verification.",
    ];
  }

  // Confidence: combine validator + ownership + execution mode.
  const baseConfidence = graph.skill_graph.length
    ? graph.skill_graph.reduce((s, x) => s + (x.confidence ?? 0.5), 0) / graph.skill_graph.length
    : 0.5;
  let confidence = baseConfidence;
  if (ownership?.confidence === "verified") confidence = Math.min(1, confidence + 0.1);
  if (ownership?.confidence === "unverified") confidence = Math.max(0, confidence - 0.1);
  if (state.execution_mode === "cli" || state.execution_mode === "hybrid") confidence = Math.min(1, confidence + 0.05);
  out.confidence = Math.round(confidence * 100) / 100;

  // Shortlist / caution reasons.
  if (out.hiring_recommendation === "Strong shortlist") {
    out.shortlist_reason = `Overall ${graph.overall_score}/100, ownership ${ownership?.confidence ?? "unknown"}, ${terminal.length ? "terminal evidence captured" : "repo-only signals"}.`;
    out.caution_reason = null;
  } else {
    out.shortlist_reason = null;
    out.caution_reason = risks.slice(0, 2).join(" · ") || "Insufficient evidence depth.";
  }

  out.biggest_risks = Array.from(new Set(risks)).slice(0, 6);
  out.best_evidence = evidence.slice(0, 6);
  return out;
}

function fallback(state: MissionState, graph: SkillGraphOutput): ProfileOutput {
  const overall = graph.overall_score;
  const rec = hiringRecFromScore(overall);
  const base: EmployerVerifier = {
    hiring_recommendation: rec,
    top_verified_skills: graph.top_strengths,
    biggest_risks: [
      ...(graph.not_measured.length ? [`Not measured: ${graph.not_measured.join(", ")}.`] : []),
      ...(state.authenticity?.risk_signals ?? []).slice(0, 3),
    ],
    best_evidence: graph.skill_graph.flatMap((s) => s.evidence.slice(0, 1)).slice(0, 4),
    suggested_followup_questions: [
      `Walk through your testing strategy for the ${graph.growth_areas[0] ?? "weakest"} area.`,
      "Describe a debugging session you ran in this repo end-to-end.",
      "What would you refactor first if you had a free day?",
    ],
    role_fit_summary: `${rec} for ${state.target_role} at ${state.candidate_level} level.`,
  };
  return {
    developer_summary: `${graph.role_fit} with an overall SkillProof score of ${overall}/100. Strongest in ${graph.top_strengths.join(", ") || "(no strong area)"}.`,
    verified_skills: graph.top_strengths,
    improvement_areas: graph.growth_areas,
    employer_recommendation: `${rec}. Verify ${graph.growth_areas[0] ?? "testing"} depth in a follow-up before production-critical assignments.`,
    evidence_highlights: graph.skill_graph.flatMap((s) => s.evidence.slice(0, 1)).slice(0, 6),
    employer_verifier: augmentEmployerVerifier(state, graph, base),
    improvement_plan: fallbackImprovementPlan(state, graph),
  };
}

export async function runProfileGen(state: MissionState, graph: SkillGraphOutput): Promise<Handoff<ProfileOutput>> {
  const user = `Skill graph:
${JSON.stringify(graph, null, 2)}

Target role: ${state.target_role}
Candidate level: ${state.candidate_level}
Authenticity signals: ${JSON.stringify(state.authenticity ?? null)}
Execution mode: ${state.execution_mode}
Ownership status: ${JSON.stringify(state.ownership_status ?? null)}
Terminal evidence summary: ${JSON.stringify(summarizeTerminalEvidence(getTerminalEvidence(state)))}

Return the JSON now.`;

  const res = await runAgentJson<ProfileOutput>({
    state,
    agentName: "profile-gen",
    role: "profile",
    system: composeAgentSystem(SYSTEM),
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 2200,
  });

  let out = res.output;
  if (!out?.employer_verifier || !out?.improvement_plan) {
    throw new Error("profile-gen returned incomplete JSON");
  }
  // Always augment employer_verifier with deterministic local-proof signals.
  out.employer_verifier = augmentEmployerVerifier(state, graph, state.employerVerifier ?? out.employer_verifier);
  out.improvement_plan = state.improvementPlan ?? out.improvement_plan;

  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;

  return {
    agent: "profile-gen",
    completed: ["public_profile_drafted", "employer_verifier_built", "improvement_plan_built"],
    unresolved: [],
    evidence: [
      ...out.evidence_highlights,
      { reason: `provider=${res.provider} model=${res.model}` },
    ],
    issues_found: [],
    output: out,
  };
}
