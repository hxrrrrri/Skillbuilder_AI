import { runAgentJson } from "@/lib/providers/run-agent";
import type { Handoff, MissionState, ValidationAssertion, ValidationContract } from "./types";

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
    {
      "id": string,
      "dimension": string,
      "statement": string,
      "weight": number,
      "detector": "static"|"terminal"|"llm"|"interview"|"challenge",
      "required_evidence": number
    }
  ],
  "rubric": {
    "<dimension>": {"weight": number, "passingScore": number}
  }
}

Cover these dimensions: architecture, code_quality, testing, security, git_workflow, documentation, debugging, ai_collaboration, communication.
Weights must sum approximately to 100 across rubric entries. Assertions should be concrete and verifiable from a repo (e.g. "Repo contains at least one integration test that exercises a route handler").`;

const SCHEMA_HINT = '{"mission_id":string,"target_role":string,"candidate_level":string,"evaluation_dimensions":string[],"assertions":[{"id":string,"dimension":string,"statement":string,"weight":number,"detector":"static|terminal|llm|interview|challenge","required_evidence":number}],"rubric":Record<string,{weight:number,passingScore:number}>}';

function assertion(
  id: string,
  dimension: string,
  statement: string,
  weight: number,
  detector: ValidationAssertion["detector"] = "static",
  required_evidence = 1
): ValidationAssertion {
  return { id, dimension, statement, weight, detector, required_evidence };
}

function normalizeContract(contract: ValidationContract, state: MissionState): ValidationContract {
  return {
    ...contract,
    mission_id: contract.mission_id || state.mission_id,
    target_role: contract.target_role || state.target_role,
    candidate_level: contract.candidate_level || state.candidate_level,
    assertions: (contract.assertions ?? []).map((a) => ({
      ...a,
      detector: a.detector ?? (
        a.dimension === "testing" || a.dimension === "git_workflow" ? "terminal"
          : a.dimension === "communication" ? "interview"
          : a.dimension === "ai_collaboration" ? "challenge"
          : "static"
      ),
      required_evidence: Math.max(1, a.required_evidence ?? 1),
    })),
  };
}

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
      assertion("A1", "architecture", "Project separates UI, data, and business logic into distinct modules.", 8),
      assertion("A2", "architecture", "Config and secrets are not hard-coded in application code.", 4),
      assertion("A3", "code_quality", "Functions have descriptive names and bounded responsibilities.", 8),
      assertion("A4", "code_quality", "Strict typing is used where the language supports it.", 4),
      assertion("A5", "testing", "Repo contains automated tests for at least one critical path.", 10, "terminal"),
      assertion("A6", "testing", "CI runs tests on push or PR.", 5, "terminal"),
      assertion("A7", "security", "No secrets, API keys, or credentials are committed.", 6),
      assertion("A8", "security", "User input crossing trust boundaries is validated.", 4),
      assertion("A9", "git_workflow", "Commits are incremental and use meaningful messages.", 7, "terminal"),
      assertion("A10", "documentation", "README explains what the project does and how to run it.", 7),
      assertion("A11", "debugging", "Errors are handled with informative messages, not silenced.", 6, "interview"),
      assertion("A12", "ai_collaboration", "If AI was used, generated code is integrated thoughtfully and tested.", 4, "challenge"),
      assertion("A13", "communication", "Candidate can explain implementation choices in their own words.", 5, "interview"),
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

  const contract = normalizeContract(
    res.output && res.output.assertions?.length ? res.output : fallbackContract(state),
    state
  );
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
