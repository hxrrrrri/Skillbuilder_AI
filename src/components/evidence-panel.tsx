"use client";
import { Badge } from "@/components/ui/badge";

type Evidence = { file?: string; line?: number; reason: string };

function tone(score: number): "good" | "warn" | "bad" {
  if (score >= 70) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

export function EvidencePanel({
  scores,
}: {
  scores: Array<{ skill: string; score: number; confidence: number; evidence: Evidence[] }>;
}) {
  return (
    <div className="space-y-3">
      {scores.map((s) => (
        <div key={s.skill} className="rounded-lg border border-border bg-panel/70 p-4">
          <div className="flex items-center justify-between">
            <div className="font-medium text-ink">{s.skill}</div>
            <div className="flex items-center gap-2">
              <Badge tone={tone(s.score)}>{s.score}/100</Badge>
              <span className="text-xs text-muted">conf {Math.round(s.confidence * 100)}%</span>
            </div>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {s.evidence.length === 0 && <li className="italic">No evidence cited.</li>}
            {s.evidence.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">›</span>
                <span>
                  {e.file && <span className="text-ink/80 font-mono text-xs mr-1">{e.file}{e.line ? `:${e.line}` : ""}</span>}
                  {e.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
