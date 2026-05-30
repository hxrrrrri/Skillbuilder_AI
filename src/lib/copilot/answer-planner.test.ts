import { describe, it, expect } from "vitest";
import {
  planAnswer,
  canBackendFormat,
  needsLlmSynthesis,
  BACKEND_FORMATTED_TOOLS,
  ANSWER_STRUCTURE,
} from "./answer-planner";

describe("needsLlmSynthesis", () => {
  it("detects interpretation intents", () => {
    for (const m of ["why is this failing", "explain the architecture", "compare the providers", "what should I do next", "recommend a fix"]) {
      expect(needsLlmSynthesis(m)).toBe(true);
    }
  });
  it("is false for plain lookups", () => {
    for (const m of ["list the profiles", "show provider health", "students with profiles"]) {
      expect(needsLlmSynthesis(m)).toBe(false);
    }
  });
});

describe("planAnswer", () => {
  it("backend-formats a plain read with a known formatter — no LLM", () => {
    const plan = planAnswer({ message: "students with profiles", toolName: "list_students_with_profiles" });
    expect(plan.strategy).toBe("backend_format");
    expect(plan.needsLlm).toBe(false);
    expect(plan.sendShape).toBe("none");
  });

  it("synthesizes when the admin asks to explain a tool result", () => {
    const plan = planAnswer({ message: "explain the provider health", toolName: "read_provider_health" });
    expect(plan.strategy).toBe("llm_synthesis");
    expect(plan.needsLlm).toBe(true);
    expect(plan.sendShape).toBe("summary");
  });

  it("sends full JSON only when debug is explicitly requested", () => {
    const plan = planAnswer({ message: "explain it", toolName: "read_provider_health", debugJson: true });
    expect(plan.sendShape).toBe("full_json");
  });

  it("falls back to LLM when a tool has no backend formatter", () => {
    const plan = planAnswer({ message: "read audit logs", toolName: "read_audit_logs" });
    expect(plan.strategy).toBe("llm_synthesis");
  });

  it("uses the template strategy when there is no tool result", () => {
    const plan = planAnswer({ message: "how does verification work" });
    expect(plan.strategy).toBe("template");
    expect(plan.needsLlm).toBe(true);
  });

  it("always recommends the standard answer structure", () => {
    expect(planAnswer({ message: "x" }).structure).toEqual(ANSWER_STRUCTURE);
  });
});

describe("backend formatter registry", () => {
  it("matches the engine's formatted tools", () => {
    expect(canBackendFormat("read_platform_overview")).toBe(true);
    expect(canBackendFormat("read_audit_logs")).toBe(false);
    expect(BACKEND_FORMATTED_TOOLS.has("list_profiles_admin")).toBe(true);
  });
});
