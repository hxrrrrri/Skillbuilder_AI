// Answer planning: decide HOW a copilot turn should be answered.
//
// The cheapest correct answer is a deterministic backend-formatted one (no model
// call). The planner decides, for a given message + (optional) tool result:
//   - can the backend format this directly? (a bespoke markdown formatter exists)
//   - does the answer actually need an LLM to synthesize / interpret / compare?
//   - what summary shape should be sent to the model (so we don't ship raw JSON)?
//   - what response structure the answer should follow.
//
// The router consults `needsLlmSynthesis` so a read intent that also asks the
// model to *explain / compare / recommend* is sent through the LLM (with the
// relevant tool) instead of being answered by a flat table.

/** Tools that have a deterministic backend markdown formatter in the engine. */
export const BACKEND_FORMATTED_TOOLS = new Set<string>([
  "list_students_with_profiles",
  "search_candidates_admin",
  "get_student_profile_admin",
  "list_profiles_admin",
  "read_platform_overview",
  "read_provider_health",
  "read_agent_configs",
  "read_failed_runs",
  "explain_data_model",
  "explain_project_architecture",
  "explain_route_or_feature",
]);

export function canBackendFormat(toolName: string): boolean {
  return BACKEND_FORMATTED_TOOLS.has(toolName);
}

// Words that signal the admin wants interpretation, not just a data dump.
const SYNTHESIS_TRIGGERS =
  /\b(explain|why|compare|recommend|what should i|how do i|interpret|assess|diagnose|advise|suggest|plan|trade[- ]?off|pros and cons)\b/i;

export function needsLlmSynthesis(message: string): boolean {
  return SYNTHESIS_TRIGGERS.test(message);
}

export type AnswerStrategy = "backend_format" | "llm_synthesis" | "template";
export type SendShape = "none" | "summary" | "full_json";

export type AnswerPlan = {
  strategy: AnswerStrategy;
  needsLlm: boolean;
  /** What to hand the model when synthesis is required. */
  sendShape: SendShape;
  /** Recommended markdown section order for the reply. */
  structure: string[];
  reason: string;
};

export const ANSWER_STRUCTURE = ["## Answer", "## Details", "## Relevant data", "## Next action"];

/**
 * Plan the answer for a message and optional tool result.
 *  - tool result + no synthesis word + bespoke formatter → backend_format (0 LLM)
 *  - synthesis word OR no formatter → llm_synthesis (send a SUMMARY, not raw JSON,
 *    unless the admin explicitly asks for debug JSON)
 *  - no tool at all → template (let the model answer in the standard structure)
 */
export function planAnswer(opts: { message: string; toolName?: string | null; debugJson?: boolean }): AnswerPlan {
  const synth = needsLlmSynthesis(opts.message);
  if (opts.toolName) {
    if (!synth && canBackendFormat(opts.toolName)) {
      return {
        strategy: "backend_format",
        needsLlm: false,
        sendShape: "none",
        structure: ANSWER_STRUCTURE,
        reason: `backend formatter for ${opts.toolName}`,
      };
    }
    return {
      strategy: "llm_synthesis",
      needsLlm: true,
      sendShape: opts.debugJson ? "full_json" : "summary",
      structure: ANSWER_STRUCTURE,
      reason: synth ? "synthesis intent on tool result" : `no backend formatter for ${opts.toolName}`,
    };
  }
  return {
    strategy: "template",
    needsLlm: true,
    sendShape: "none",
    structure: ANSWER_STRUCTURE,
    reason: "no tool result; model answers in standard structure",
  };
}
