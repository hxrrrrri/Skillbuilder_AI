"use client";
import { Badge } from "@/components/ui/badge";

type Coverage = {
  assertion_id: string;
  dimension: string;
  status: "passed" | "failed" | "partial" | "unknown";
  evidence: Array<{ file?: string; reason: string }>;
  responsible_agent: string;
  notes: string;
  confidence?: number;
};

type Assertion = { id: string; dimension: string; statement: string; weight: number };

function statusTone(s: Coverage["status"]): "good" | "warn" | "bad" | "default" {
  if (s === "passed") return "good";
  if (s === "partial") return "warn";
  if (s === "failed") return "bad";
  return "default";
}

export function ContractCoverage({
  assertions,
  coverage,
}: {
  assertions: Assertion[];
  coverage: Coverage[];
}) {
  const byId = new Map(coverage.map((c) => [c.assertion_id, c]));
  const counts = { passed: 0, partial: 0, failed: 0, unknown: 0 };
  for (const a of assertions) {
    const c = byId.get(a.id);
    if (c) counts[c.status] += 1;
    else counts.unknown += 1;
  }

  const evidenceCoverage = assertions.length
    ? Math.round((coverage.filter((c) => c.evidence.length > 0).length / assertions.length) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="good">Passed {counts.passed}</Badge>
        <Badge tone="warn">Partial {counts.partial}</Badge>
        <Badge tone="bad">Failed {counts.failed}</Badge>
        <Badge>Unknown {counts.unknown}</Badge>
        <Badge tone={evidenceCoverage >= 70 ? "good" : evidenceCoverage >= 40 ? "warn" : "bad"}>
          Evidence coverage {evidenceCoverage}%
        </Badge>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-panel2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Dimension</th>
              <th className="p-2 text-left">Statement</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Agent</th>
              <th className="p-2 text-left">Conf</th>
              <th className="p-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {assertions.map((a) => {
              const c = byId.get(a.id);
              const status = c?.status ?? "unknown";
              return (
                <tr key={a.id} className="border-t border-border align-top">
                  <td className="p-2 font-mono text-xs">{a.id}</td>
                  <td className="p-2 text-xs">{a.dimension}</td>
                  <td className="p-2">{a.statement}</td>
                  <td className="p-2"><Badge tone={statusTone(status)}>{status}</Badge></td>
                  <td className="p-2 text-xs text-muted">{c?.responsible_agent ?? "—"}</td>
                  <td className="p-2 text-xs text-muted">{c?.confidence != null ? `${Math.round(c.confidence * 100)}%` : "—"}</td>
                  <td className="p-2 text-xs text-muted">{c?.notes ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
