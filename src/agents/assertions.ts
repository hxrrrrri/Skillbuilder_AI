import type { AgentName, Evidence, MissionState, ValidationAssertion, ValidationAssertionResult } from "./types";

function hasDirectEvidence(e: Evidence): boolean {
  if (e.source === "terminal" || e.source === "interview" || e.source === "challenge") return true;
  if (e.source === "github_api" && !e.file) return true;
  return !!e.file && (!!e.snippet || !!e.line_start || !!e.line || e.source === "github_api" || e.source === "heuristic" || e.source === "llm");
}

export function assertionResultsForDimension(args: {
  state: MissionState;
  dimension: string;
  agent: AgentName;
  evidence: Evidence[];
  passed?: (assertion: ValidationAssertion) => boolean;
  failed?: (assertion: ValidationAssertion) => boolean;
  partial?: (assertion: ValidationAssertion) => boolean;
  baseNote?: string;
}): ValidationAssertionResult[] {
  const contract = args.state.contract;
  if (!contract) return [];
  const direct = args.evidence.filter(hasDirectEvidence);
  return contract.assertions
    .filter((a) => a.dimension === args.dimension)
    .map((a) => {
      const needed = Math.max(1, a.required_evidence ?? 1);
      let status: ValidationAssertionResult["status"] = "unknown";
      if (args.failed?.(a)) status = "failed";
      else if (direct.length >= needed && (args.passed?.(a) ?? true)) status = "passed";
      else if (direct.length > 0 || args.partial?.(a)) status = "partial";
      const confidence =
        status === "passed" ? Math.min(0.95, 0.55 + direct.length * 0.15) :
        status === "partial" ? 0.55 :
        status === "failed" ? 0.75 :
        0.25;
      return {
        assertion_id: a.id,
        dimension: a.dimension,
        status,
        confidence,
        evidence: direct.slice(0, needed),
        responsible_agent: args.agent,
        notes:
          args.baseNote ??
          (status === "passed"
            ? `Direct evidence met requirement (${direct.length}/${needed}).`
            : status === "partial"
              ? `Only partial direct evidence available (${direct.length}/${needed}).`
              : status === "failed"
                ? "Detector found a negative signal."
                : "No direct evidence for this assertion."),
      };
    });
}
