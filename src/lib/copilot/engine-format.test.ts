import { describe, it, expect, vi } from "vitest";

// The formatters are pure, but engine.ts pulls in db/provider modules at import
// time, so we stub those exactly like engine.test.ts does.
vi.mock("@/lib/copilot/provider", () => ({
  resolveChatProvider: vi.fn(),
  runChatTurn: vi.fn(),
  CopilotProviderNotReadyError: class extends Error {},
}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/providers/cache", () => ({ invalidateProviderRegistryCache: vi.fn() }));
vi.mock("@/lib/providers/registry", () => ({ listProviderConfigs: vi.fn(), listAgentConfigs: vi.fn() }));
vi.mock("@/lib/providers/provider-router", () => ({ listProviderHealth: vi.fn(), checkProviderReadinessForMode: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import {
  formatStudentsWithProfiles,
  formatProfiles,
  formatCandidateSearch,
  formatPlatformOverview,
  formatExplanation,
  noData,
} from "./engine";

const studentItem = {
  candidate: { name: "Ada Lovelace", email: "ada@example.com", githubUsername: "ada" },
  profile: { slug: "ada-lovelace-backend", visibility: "public", route: "/profile/ada-lovelace-backend" },
  run: { overallScore: 91, targetRole: "Backend Engineer", status: "completed", route: "/admin/runs/run_1" },
  repository: { fullName: "ada/api" },
  routes: ["/profile/ada-lovelace-backend", "/admin/runs/run_1"],
};

describe("formatStudentsWithProfiles", () => {
  it("returns a markdown table with heading, summary, and route links", () => {
    const md = formatStudentsWithProfiles({ ok: true, count: 1, items: [studentItem] });
    expect(md).toContain("## Students with created profiles");
    expect(md).toContain("Found **1**");
    expect(md).toContain("| Student | Email | GitHub |");
    expect(md).toContain("Ada Lovelace");
    expect(md).toContain("[/profile/ada-lovelace-backend](/profile/ada-lovelace-backend)");
    expect(md).toContain("## Next action");
  });

  it("returns a clear 'No matching data found' answer when empty", () => {
    const md = formatStudentsWithProfiles({ ok: true, count: 0, items: [] });
    expect(md).toContain("No matching data found");
    expect(md).toContain("## Students with created profiles");
  });
});

describe("formatProfiles / formatCandidateSearch", () => {
  it("renders profiles as a markdown table", () => {
    const md = formatProfiles({ ok: true, count: 1, items: [studentItem] });
    expect(md).toContain("## Profiles");
    expect(md).toContain("| Profile | Visibility |");
    expect(md).toContain("ada-lovelace-backend");
  });

  it("renders an empty candidate search as no-data", () => {
    expect(formatCandidateSearch({ ok: true, count: 0, items: [] })).toContain("No matching data found");
  });
});

describe("formatPlatformOverview", () => {
  it("uses bullets and a breakdown table, and includes route links", () => {
    const md = formatPlatformOverview({
      detail: {
        usersByRole: { admin: 1, candidate: 4 },
        profilesByVisibility: { public: 2 },
        runsByStatus: { completed: 3 },
        tenantsByKind: { college: 1 },
        candidatesCount: 4,
        cohortsCount: 1,
        providerReadiness: { configured: 3, enabled: 2, ready: 1 },
      },
      routes: ["/admin/users", "/admin/providers/health"],
    });
    expect(md).toContain("## Platform overview");
    expect(md).toContain("- **Candidates:** 4");
    expect(md).toContain("| Dimension | Breakdown |");
    expect(md).toContain("admin: 1");
    expect(md).toContain("[/admin/users](/admin/users)");
  });
});

describe("formatExplanation + noData", () => {
  it("renders explanation entries with a heading and bullets", () => {
    const md = formatExplanation("explain_data_model", {
      items: [{ model: "AnalysisRun", explanation: "Stores a verification run.", files: ["prisma/schema.prisma"] }],
      routes: ["/admin/runs"],
    });
    expect(md).toContain("## Data model");
    expect(md).toContain("**AnalysisRun**");
    expect(md).toContain("Stores a verification run.");
  });

  it("noData always contains the canonical phrase", () => {
    expect(noData("X", "nothing here.", ["try again"])).toContain("No matching data found");
  });
});
