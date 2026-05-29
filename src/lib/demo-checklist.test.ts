import { describe, expect, it } from "vitest";
import { buildDemoChecklist } from "./demo-checklist";

describe("buildDemoChecklist", () => {
  it("reports setup status and next actions without inventing readiness", () => {
    const checklist = buildDemoChecklist({
      databaseReady: true,
      seededUsersReady: false,
      providerRegistryReady: true,
      promptVersionsReady: true,
      providerHealth: [
        { providerId: "anthropic_api", label: "Anthropic API", status: "installed_not_authenticated", fix: "Set ANTHROPIC_API_KEY." },
        { providerId: "deterministic", label: "Deterministic evidence", status: "ready", fix: "Ready." },
      ],
      workerMode: "in_process",
      terminalEnabled: false,
      publicReportsEnabled: true,
      githubTokenConfigured: false,
      githubRateLimit: null,
    });

    expect(checklist.every((item) => item.nextAction.length > 0)).toBe(true);
    expect(checklist.find((item) => item.id === "provider_health")?.status).toBe("blocked");
    expect(checklist.find((item) => item.id === "seeded_users")?.nextAction).toContain("npm run db:seed-users");
    expect(checklist.find((item) => item.id === "terminal_proof")?.status).toBe("warn");
  });
});
