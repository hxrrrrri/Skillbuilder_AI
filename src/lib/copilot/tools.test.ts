import { describe, expect, it } from "vitest";
import { resolveToolPermission, listTools, toolManifest, getTool, type ToolContext } from "./tools";
import { buildHelpGuidance } from "./context";
import type { SessionUser } from "@/lib/auth/session";

const admin: SessionUser = { id: "a1", email: "a@x.dev", name: "A", role: "admin", primaryTenantId: null, tenantIds: [] };
const candidate: SessionUser = { id: "c1", email: "c@x.dev", name: "C", role: "candidate", primaryTenantId: null, tenantIds: [] };

const adminCtx: ToolContext = { user: admin, mode: "admin" };
const helpCandidateCtx: ToolContext = { user: candidate, mode: "help" };
const adminModeAsCandidate: ToolContext = { user: candidate, mode: "admin" };

describe("tool permission policy", () => {
  it("(#2) non-admin cannot call admin chat tools", () => {
    const perm = resolveToolPermission("read_provider_health", adminModeAsCandidate);
    expect(perm.allowed).toBe(false);
    if (!perm.allowed) expect(perm.reason).toBe("forbidden_role");
  });

  it("(#3) admin tools are not reachable from help mode", () => {
    const perm = resolveToolPermission("read_provider_health", helpCandidateCtx);
    expect(perm.allowed).toBe(false);
    if (!perm.allowed) expect(perm.reason).toBe("mode_mismatch");
    // and the help manifest never advertises admin tools
    const helpNames = listTools("help", "candidate").map((t) => t.name);
    expect(helpNames).not.toContain("read_provider_health");
    expect(helpNames).not.toContain("bulk_set_agent_provider");
  });

  it("(#9) forbidden tools are always refused, even for admins", () => {
    for (const name of ["bypass_publish_gate", "fabricate_evidence", "reveal_secrets", "run_arbitrary_sql", "run_arbitrary_shell"]) {
      const perm = resolveToolPermission(name, adminCtx);
      expect(perm.allowed).toBe(false);
      if (!perm.allowed) expect(perm.reason).toBe("forbidden");
    }
    // forbidden tools are never advertised in any manifest
    expect(toolManifest("admin", "admin").some((t) => t.risk === "forbidden")).toBe(false);
  });

  it("(#14) permission depends on role+registry, not message content (injection-proof)", () => {
    // The resolver takes no message — a malicious prompt cannot widen access.
    // An admin tool stays denied for a candidate regardless of any instruction text.
    expect(resolveToolPermission("update_provider_config", helpCandidateCtx).allowed).toBe(false);
    expect(resolveToolPermission("bulk_set_agent_provider", adminModeAsCandidate).allowed).toBe(false);
    // unknown / invented tool names are denied
    expect(resolveToolPermission("sudo_do_anything", adminCtx).allowed).toBe(false);
    // a legitimate admin tool is allowed for a real admin
    expect(resolveToolPermission("read_provider_health", adminCtx).allowed).toBe(true);
  });

  it("classifies risk levels correctly", () => {
    expect(getTool("read_provider_health")?.risk).toBe("read");
    expect(getTool("update_agent_config")?.risk).toBe("write_safe");
    expect(getTool("bulk_set_agent_provider")?.risk).toBe("write_sensitive");
    expect(getTool("purge_old_audit_logs")?.risk).toBe("destructive");
    expect(getTool("reveal_secrets")?.risk).toBe("forbidden");
  });
});

describe("(#12) role-aware help guidance", () => {
  it("gives candidate-specific steps", () => {
    const g = buildHelpGuidance("candidate");
    expect(g.role).toBe("candidate");
    expect(g.steps.join(" ").toLowerCase()).toContain("ownership");
    expect(g.steps.join(" ").toLowerCase()).toContain("publish");
  });

  it("gives employer-specific steps", () => {
    const g = buildHelpGuidance("employer");
    expect(g.role).toBe("employer");
    expect(g.steps.join(" ").toLowerCase()).toContain("shortlist");
  });

  it("gives college-specific steps", () => {
    expect(buildHelpGuidance("college_admin").role).toBe("college");
    expect(buildHelpGuidance("college_admin").steps.join(" ").toLowerCase()).toContain("cohort");
  });

  it("gives admin-specific steps", () => {
    const g = buildHelpGuidance("admin");
    expect(g.role).toBe("admin");
    expect(g.steps.join(" ").toLowerCase()).toContain("provider");
  });
});
