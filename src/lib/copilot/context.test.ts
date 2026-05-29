import { describe, expect, it } from "vitest";
import { buildCopilotContext } from "./context";
import type { SessionUser } from "@/lib/auth/session";

const admin: SessionUser = { id: "a1", email: "a@x.dev", name: "A", role: "admin", primaryTenantId: null, tenantIds: [] };
const candidate: SessionUser = { id: "c1", email: "c@x.dev", name: "C", role: "candidate", primaryTenantId: null, tenantIds: [] };

const deps = {
  listProviderConfigs: async () => [
    { providerId: "anthropic_api", label: "Anthropic API", kind: "api", enabled: true, defaultModel: "claude", apiKeyEnv: "ANTHROPIC_API_KEY", lastTestStatus: "ok", lastTestJsonOk: true, lastTestedAt: null },
  ],
  listAgentConfigs: async () => [{ agentName: "orchestrator", providerId: "codex_cli", model: "gpt-5.5", reasoningBudget: "high", enabled: true }],
  checkReadiness: async () => ({ ok: true, blockers: [] }),
};

describe("(#3) help context never exposes admin data", () => {
  it("help mode omits provider registry, schema, and permissions internals", async () => {
    const ctx = await buildCopilotContext({ mode: "help", user: candidate }, deps as any);
    expect(ctx.providerRegistry).toBeUndefined();
    expect(ctx.schemaSummary).toBeUndefined();
    expect(ctx.rolePermissions).toBeUndefined();
    expect(ctx.roleGuidance.role).toBe("candidate");
  });

  it("admin mode without a real admin still omits the registry snapshot", async () => {
    const ctx = await buildCopilotContext({ mode: "admin", user: candidate }, deps as any);
    expect(ctx.providerRegistry).toBeUndefined();
  });

  it("admin mode for an admin includes a redacted registry snapshot", async () => {
    const ctx = await buildCopilotContext({ mode: "admin", user: admin }, deps as any);
    expect(ctx.providerRegistry).toBeDefined();
    const json = JSON.stringify(ctx.providerRegistry);
    // env var NAME is masked by the secret-key redactor; no raw key value leaks.
    expect(json).not.toContain("sk-ant");
    expect(json).toContain("anthropic_api");
  });
});
