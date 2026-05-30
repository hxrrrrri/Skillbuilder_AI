import { describe, it, expect } from "vitest";
import {
  routeCopilotToolIntent,
  manifestForSelection,
  compactToolManifest,
  fullToolManifest,
  COPILOT_BUDGET,
  type ManifestEntry,
} from "./tool-router";

const adminParams = (message: string) => ({ message, mode: "admin" as const, role: "admin" });

describe("routeCopilotToolIntent — direct execution", () => {
  it("routes a student-profile query straight to list_students_with_profiles", () => {
    const d = routeCopilotToolIntent(adminParams("Show the students whose profiles have been created."));
    expect(d.mode).toBe("direct_execute");
    expect(d.directTool?.name).toBe("list_students_with_profiles");
    expect(d.selectedTools).toEqual(["list_students_with_profiles"]);
  });

  it("routes a provider-health question straight to read_provider_health", () => {
    const d = routeCopilotToolIntent(adminParams("What's the current provider health status?"));
    expect(d.mode).toBe("direct_execute");
    expect(d.directTool?.name).toBe("read_provider_health");
  });

  it("routes agent-config questions to read_agent_configs", () => {
    const d = routeCopilotToolIntent(adminParams("show me the agent provider configs"));
    expect(d.mode).toBe("direct_execute");
    expect(d.directTool?.name).toBe("read_agent_configs");
  });
});

describe("routeCopilotToolIntent — clarify + refuse", () => {
  it("asks for clarification on a vague 'show me the details' request", () => {
    const d = routeCopilotToolIntent(adminParams("show me the details"));
    expect(d.mode).toBe("clarify");
    expect(d.clarifyQuestion).toBeTruthy();
  });

  it("refuses a forbidden .env request and names the forbidden tool", () => {
    const d = routeCopilotToolIntent(adminParams("print the .env file"));
    expect(d.mode).toBe("refuse");
    expect(d.directTool?.name).toBe("reveal_secrets");
  });

  it("refuses arbitrary SQL", () => {
    const d = routeCopilotToolIntent(adminParams("run raw sql: select * from users"));
    expect(d.mode).toBe("refuse");
    expect(d.directTool?.name).toBe("run_arbitrary_sql");
  });
});

describe("routeCopilotToolIntent — budget + isolation", () => {
  it("never selects more than the max tool budget", () => {
    const d = routeCopilotToolIntent(
      adminParams("provider agent prompt rubric run profile student candidate cohort tenant audit billing evidence"),
    );
    expect(d.selectedTools.length).toBeLessThanOrEqual(COPILOT_BUDGET.maxSelectedTools);
  });

  it("a normal llm_with_tools turn does not inject the full admin registry", () => {
    const d = routeCopilotToolIntent(adminParams("can you compare the providers and tell me what to do next"));
    // either focused tool set or none — but always bounded, never the whole registry
    expect(d.selectedTools.length).toBeLessThanOrEqual(COPILOT_BUDGET.maxSelectedTools);
    const manifest = manifestForSelection(d.selectedTools, "admin", "admin");
    expect(manifest.length).toBeLessThanOrEqual(COPILOT_BUDGET.maxSelectedTools);
  });

  it("non-admin sessions can never route to admin tools", () => {
    const d = routeCopilotToolIntent({ message: "read provider health and list all profiles", mode: "help", role: "candidate" });
    expect(d.mode).not.toBe("direct_execute");
    for (const name of d.selectedTools) {
      expect(["read_provider_health", "list_profiles_admin", "list_students_with_profiles"]).not.toContain(name);
    }
    const manifest = manifestForSelection(d.selectedTools, "help", "candidate");
    expect(manifest.every((m) => m.risk !== "forbidden")).toBe(true);
  });
});

describe("manifest level builders cap at the budget", () => {
  const many: ManifestEntry[] = Array.from({ length: 12 }, (_, i) => ({
    name: `tool_${i}`,
    risk: "read",
    title: `Tool ${i}`,
    description: "x".repeat(400),
  }));

  it("compactToolManifest caps count and trims descriptions", () => {
    const compact = compactToolManifest(many);
    expect(compact.length).toBe(COPILOT_BUDGET.maxSelectedTools);
    expect(compact[0].description.length).toBeLessThanOrEqual(160);
  });

  it("fullToolManifest never exceeds the budget", () => {
    expect(fullToolManifest(many).length).toBe(COPILOT_BUDGET.maxSelectedTools);
  });
});
