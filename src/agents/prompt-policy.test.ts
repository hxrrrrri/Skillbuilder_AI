import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  AGENT_PROMPT_POLICY,
  COMMON_AGENT_RULES,
  EVIDENCE_RULES,
  NOT_MEASURED_RULES,
  TOKEN_BUDGET_RULES,
  SECURITY_REDACTION_RULES,
  composeAgentSystem,
  hasAgentPolicy,
} from "./prompt-policy";

const WIRED_AGENTS = [
  "security", "code-quality", "validator", "interview-gen", "profile-gen",
  "improvement-plan", "authenticity", "architecture", "orchestrator",
  "answer-evaluator", "testing", "documentation", "employer-verifier",
];

describe("shared agent prompt policy", () => {
  it("demands strict JSON only", () => {
    expect(COMMON_AGENT_RULES.toLowerCase()).toContain("strict");
    expect(COMMON_AGENT_RULES.toLowerCase()).toContain("json");
    expect(COMMON_AGENT_RULES.toLowerCase()).toContain("no markdown");
  });

  it("enforces no score without evidence", () => {
    expect(EVIDENCE_RULES.toLowerCase()).toContain("no score without evidence");
    expect(EVIDENCE_RULES.toLowerCase()).toContain("file_path");
    expect(EVIDENCE_RULES.toLowerCase()).toContain("confidence");
    expect(EVIDENCE_RULES.toLowerCase()).toContain("source");
  });

  it("mentions not_measured instead of guessing a default", () => {
    expect(NOT_MEASURED_RULES.toLowerCase()).toContain("not_measured");
    expect(NOT_MEASURED_RULES).toContain("50");
  });

  it("forbids requesting a full repo dump and respects the token budget", () => {
    expect(TOKEN_BUDGET_RULES.toLowerCase()).toContain("full repo");
    expect(TOKEN_BUDGET_RULES.toLowerCase()).toContain("token");
  });

  it("requires redaction of secrets", () => {
    expect(SECURITY_REDACTION_RULES.toLowerCase()).toContain("secret");
    expect(SECURITY_REDACTION_RULES.toLowerCase()).toContain("never");
  });

  it("the combined policy carries every rule block", () => {
    for (const block of [COMMON_AGENT_RULES, EVIDENCE_RULES, NOT_MEASURED_RULES, TOKEN_BUDGET_RULES, SECURITY_REDACTION_RULES]) {
      expect(AGENT_PROMPT_POLICY).toContain(block);
    }
  });
});

describe("composeAgentSystem", () => {
  it("appends the contract to a base prompt", () => {
    const composed = composeAgentSystem("BASE PROMPT");
    expect(composed.startsWith("BASE PROMPT")).toBe(true);
    expect(hasAgentPolicy(composed)).toBe(true);
  });

  it("is idempotent (never double-applies)", () => {
    const once = composeAgentSystem("BASE");
    const twice = composeAgentSystem(once);
    expect(twice).toBe(once);
  });

  it("does not ask the model for a full repo dump", () => {
    const composed = composeAgentSystem("BASE").toLowerCase();
    expect(composed).toContain("provided snippets only");
    expect(composed).not.toContain("dump the entire repo");
  });
});

describe("agents are wired to the shared policy", () => {
  it("every wired agent composes its SYSTEM prompt through the policy", () => {
    for (const agent of WIRED_AGENTS) {
      const src = fs.readFileSync(path.join(process.cwd(), "src/agents", `${agent}.ts`), "utf8");
      expect(src, `${agent} must import prompt-policy`).toContain("./prompt-policy");
      expect(src, `${agent} must wrap SYSTEM`).toContain("composeAgentSystem(SYSTEM)");
    }
  });
});
