"use client";
import { Badge } from "@/components/ui/badge";

type Authenticity = {
  authenticity_score: number;
  confidence: number;
  positive_signals: string[];
  risk_signals: string[];
  evidence: Array<{ file?: string; reason: string }>;
  score_source?: string;
};

export function AuthenticityCard({ data }: { data: Authenticity | null | undefined }) {
  if (!data) {
    return <div className="text-sm text-muted">Authenticity signals not available.</div>;
  }
  const tone = data.authenticity_score >= 70 ? "good" : data.authenticity_score >= 50 ? "warn" : "bad";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{data.authenticity_score}/100</Badge>
        <span className="text-xs text-muted">confidence {Math.round((data.confidence ?? 0) * 100)}%</span>
        {data.score_source && <Badge>{data.score_source}</Badge>}
        <span className="text-xs text-muted italic">Signals only — not plagiarism detection.</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-panel/70 p-3">
          <div className="text-xs uppercase tracking-wide text-accent">Positive signals</div>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {data.positive_signals.length === 0 && <li className="italic">None detected.</li>}
            {data.positive_signals.map((p, i) => (
              <li key={i} className="flex gap-2"><span className="text-accent">+</span>{p}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-panel/70 p-3">
          <div className="text-xs uppercase tracking-wide text-bad">Risk signals</div>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {data.risk_signals.length === 0 && <li className="italic">None detected.</li>}
            {data.risk_signals.map((p, i) => (
              <li key={i} className="flex gap-2"><span className="text-bad">!</span>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
