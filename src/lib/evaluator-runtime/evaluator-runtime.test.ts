import { describe, expect, it } from "vitest";
import { DEFAULT_EVALUATOR_SKILLS, loadDefaultEvaluatorSkill } from "./skill-registry";
import { validateSkillManifest } from "./validators";
import { evaluateToolPermission } from "./permission-policy";
import { findingFromLegacyEvidence } from "./evidence-contracts";
import { redactText } from "./redaction";

describe("evaluator runtime contracts", () => {
  it("loads and validates the default evaluator skill manifests", () => {
    for (const slug of DEFAULT_EVALUATOR_SKILLS) {
      const manifest = loadDefaultEvaluatorSkill(slug);
      expect(manifest.id).toBe(slug);
      expect(validateSkillManifest(manifest)).toEqual([]);
    }
  });

  it("denies tool access beyond a skill permission policy", () => {
    const decision = evaluateToolPermission(
      {
        filesystem: "read_only",
        terminal: "none",
        github: "public_read",
        network: "disabled",
        mcp: "disabled",
        secrets: "never_expose",
      },
      { terminal: "safe_commands_only", network: "allowlisted_only" },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.denied).toEqual(["terminal", "network"]);
  });

  it("marks hallucinated file paths as unsafe findings", () => {
    const finding = findingFromLegacyEvidence({
      runId: "r1",
      skillRunId: "sr1",
      skillSlug: "code-quality-review",
      contextPack: {
        meta: {
          owner: "o",
          repo: "r",
          defaultBranch: "main",
          description: null,
          primaryLanguage: "TypeScript",
          sizeKB: 1,
          stars: 0,
          createdAt: "",
          updatedAt: "",
          topics: [],
        },
        detected: {
          framework: "next",
          packageManager: "npm",
          testFramework: "vitest",
          hasCI: false,
          hasDocker: false,
          hasTypeScript: true,
        },
        filesIndex: {
          total: 1,
          all: ["src/app.ts"],
          important: ["src/app.ts"],
          config: [],
          tests: [],
          ci: [],
          readme: null,
        },
        snippets: [],
        commits: [],
        tokens: { rawEstimate: 0, packEstimate: 0 },
      },
      evidence: { file: "src/missing.ts", reason: "Great code here", source: "llm" },
    });
    expect(finding.claim).toContain("Hallucinated file reference");
    expect(finding.employerSafe).toBe(false);
    expect(finding.publicSafe).toBe(false);
  });

  it("redacts secret-like strings", () => {
    expect(redactText("token=ghp_abcdefghijklmnopqrstuvwxyz123456")).toContain("[REDACTED_SECRET]");
  });
});
