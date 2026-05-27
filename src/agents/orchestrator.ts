import { runAgentJson } from "@/lib/providers/run-agent";
import type { Handoff, MissionState, ValidationContract } from "./types";

const SYSTEM = `You are the Orchestrator agent of SkillProof AI's Mission system.
Your single job is to produce a Validation Contract BEFORE any code analysis happens.
A validation contract defines what "good" means independently of what the candidate built.

You must return STRICT JSON only — no commentary, no markdown fences — matching this shape:
{
  "mission_id": string,
  "target_role": string,
  "candidate_level": string,
  "evaluation_dimensions": string[],
  "assertions": [
    {"id": string, "dimension": string, "statement": string, "weight": number}
  ],
  "rubric": {
    "<dimension>": {"weight": number, "passingScore": number}
  }
}

Cover these dimensions: architecture, code_quality, testing, security, git_workflow, documentation, debugging, ai_collaboration, communication.
Weights must sum approximately to 100 across rubric entries. Assertions should be concrete and verifiable from a repo (e.g. "Repo contains at least one integration test that exercises a route handler").`;

const SCHEMA_HINT = '{"mission_id":string,"target_role":string,"candidate_level":string,"evaluation_dimensions":string[],"assertions":[{"id":string,"dimension":string,"statement":string,"weight":number}],"rubric":Record<string,{weight:number,passingScore:number}>}';

function fallbackContract(state: MissionState): ValidationContract {
  return {
    mission_id: state.mission_id,
    target_role: state.target_role,
    candidate_level: state.candidate_level,
    evaluation_dimensions: [
      "architecture",
      "code_quality",
      "testing",
      "security",
      "git_workflow",
      "documentation",
      "debugging",
      "ai_collaboration",
      "communication",
    ],
    assertions: [
      { id: "A1", dimension: "architecture", statement: "Project separates UI, data, and business logic into distinct modules.", weight: 8 },
      { id: "A2", dimension: "architecture", statement: "Config and secrets are not hard-coded in application code.", weight: 4 },
      { id: "A3", dimension: "code_quality", statement: "Functions have descriptive names and bounded responsibilities.", weight: 8 },
      { id: "A4", dimension: "code_quality", statement: "Strict typing is used where the language supports it.", weight: 4 },
      { id: "A5", dimension: "testing", statement: "Repo contains automated tests for at least one critical path.", weight: 10 },
      { id: "A6", dimension: "testing", statement: "CI runs tests on push or PR.", weight: 5 },
      { id: "A7", dimension: "security", statement: "No secrets, API keys, or credentials are committed.", weight: 6 },
      { id: "A8", dimension: "security", statement: "User input crossing trust boundaries is validated.", weight: 4 },
      { id: "A9", dimension: "git_workflow", statement: "Commits are incremental and use meaningful messages.", weight: 7 },
      { id: "A10", dimension: "documentation", statement: "README explains what the project does and how to run it.", weight: 7 },
      { id: "A11", dimension: "debugging", statement: "Errors are handled with informative messages, not silenced.", weight: 6 },
      { id: "A12", dimension: "ai_collaboration", statement: "If AI was used, generated code is integrated thoughtfully and tested.", weight: 4 },
      { id: "A13", dimension: "communication", statement: "Candidate can explain implementation choices in their own words.", weight: 5 },
    ],
    rubric: {
      architecture: { weight: 15, passingScore: 60 },
      code_quality: { weight: 15, passingScore: 60 },
      testing: { weight: 15, passingScore: 55 },
      security: { weight: 10, passingScore: 60 },
      git_workflow: { weight: 10, passingScore: 55 },
      documentation: { weight: 10, passingScore: 55 },
      debugging: { weight: 10, passingScore: 60 },
      ai_collaboration: { weight: 5, passingScore: 50 },
      communication: { weight: 10, passingScore: 60 },
    },
  };
}

export async function runOrchestrator(state: MissionState, jobDescription?: string): Promise<Handoff<ValidationContract>> {
  const user = `Mission: ${state.mission_id}
Target role: ${state.target_role}
Candidate level: ${state.candidate_level}
${jobDescription ? `\nJob description:\n${jobDescription}` : ""}

Produce the validation contract JSON now.`;

  const res = await runAgentJson<ValidationContract>({
    state,
    role: "orchestrator",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 2500,
    temperature: 0.2,
    fallback: () => fallbackContract(state),
  });

  const contract = res.output && res.output.assertions?.length ? res.output : fallbackContract(state);
  state.contract = contract;
  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;

  return {
    agent: "orchestrator",
    completed: ["validation_contract_authored"],
    unresolved: [],
    evidence: [{ reason: `Contract built by ${res.provider} (${res.model}); source=${res.source}` }],
    issues_found: [],
    next_recommended: "repo-scanner",
    output: contract,
  };
}
