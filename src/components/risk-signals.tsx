import { Badge } from "@/components/ui/badge";

export type RiskSignal = {
  key: string;
  label: string;
  meaning: string;
  severity: "info" | "warn" | "bad";
};

const KNOWN_PATTERNS: Array<{ match: RegExp; key: string; label: string; meaning: string; severity: RiskSignal["severity"] }> = [
  {
    match: /no\s*test|missing test|test files? .*missing|tests? not found/i,
    key: "no_tests",
    label: "No tests",
    meaning:
      "We could not find a test suite. This does not prove the code is broken, but verified projects almost always include tests. Ask the candidate how they verify their code.",
    severity: "warn",
  },
  {
    match: /shallow readme|thin readme|readme is too short|stub readme/i,
    key: "shallow_readme",
    label: "Shallow README",
    meaning:
      "The README is missing setup, usage, or explanation. This can be a signal that the candidate did not write the docs, but is not conclusive.",
    severity: "info",
  },
  {
    match: /commit burst|all commits same day|single commit|single author burst/i,
    key: "commit_burst",
    label: "Suspicious commit burst",
    meaning:
      "Almost all commits land in a very short window. This sometimes happens when a project is created right before a verification run. Ask the candidate to walk through the history.",
    severity: "warn",
  },
  {
    match: /copied|template|boilerplate|create-next-app|create-react-app/i,
    key: "templated_structure",
    label: "Templated / copied-looking structure",
    meaning:
      "Project structure matches a common framework template. This is not proof of copying, but the candidate should be able to point to non-template work.",
    severity: "info",
  },
  {
    match: /ai.*diff.*without.*tests|generated code without tests/i,
    key: "ai_without_tests",
    label: "AI diff without tests",
    meaning:
      "Candidate submitted AI-assisted changes but did not add or justify test coverage. Use the AI Collaboration Challenge to probe their review discipline.",
    severity: "warn",
  },
];

function tagSignal(text: string): RiskSignal {
  for (const p of KNOWN_PATTERNS) {
    if (p.match.test(text)) {
      return { key: p.key, label: p.label, meaning: p.meaning, severity: p.severity };
    }
  }
  return {
    key: text.slice(0, 24).replace(/\W+/g, "-").toLowerCase() || "signal",
    label: text,
    meaning: "Authenticity signal raised by the analyzer. Treat as a prompt for follow-up, not as proof.",
    severity: "info",
  };
}

export function RiskSignalsCard({
  authenticityRisks,
  ownershipStatus,
  aiCollaboration,
}: {
  authenticityRisks: string[];
  ownershipStatus: any;
  aiCollaboration: any;
}) {
  const signals: RiskSignal[] = [];

  for (const r of authenticityRisks ?? []) {
    if (typeof r === "string" && r.trim()) signals.push(tagSignal(r));
  }

  if (ownershipStatus && ownershipStatus.confidence !== "verified") {
    signals.push({
      key: "unverified_ownership",
      label: "Unverified ownership",
      meaning:
        "We have not cryptographically verified that this GitHub identity owns the repository. The candidate self-declared it. Ask them to verify via the ownership token flow or connect GitHub OAuth.",
      severity: "warn",
    });
  }

  if (aiCollaboration && aiCollaboration.test_awareness_score != null && aiCollaboration.test_awareness_score < 50) {
    signals.push({
      key: "ai_low_test_awareness",
      label: "Low test awareness in AI work",
      meaning:
        "When asked to ship an AI-assisted change, the candidate showed low test awareness. Ask them how they would test the diff before merging.",
      severity: "warn",
    });
  }

  if (signals.length === 0) {
    return (
      <p className="text-sm text-muted">
        No risk signals raised. This does not certify everything is fine; it means the available evidence checks did not flag anything.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs italic text-muted">
        Risk signals only — these are <strong>not</strong> plagiarism or fraud detection. Use as conversation
        starters, not as conclusions.
      </p>
      <ul className="space-y-2">
        {signals.map((s) => (
          <li
            key={s.key}
            className="rounded border border-border bg-panel/60 p-3 text-sm"
            title={s.meaning}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={s.severity === "bad" ? "bad" : s.severity === "warn" ? "warn" : "default"}>
                {s.label}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted">{s.meaning}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
