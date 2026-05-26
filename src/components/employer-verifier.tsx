"use client";
import { Badge } from "@/components/ui/badge";

type Employer = {
  hiring_recommendation: "Strong shortlist" | "Consider with reservations" | "Needs more proof";
  top_verified_skills: string[];
  biggest_risks: string[];
  best_evidence: Array<{ file?: string; reason: string }>;
  suggested_followup_questions: string[];
  role_fit_summary: string;
};

function recTone(r: Employer["hiring_recommendation"]) {
  if (r === "Strong shortlist") return "good" as const;
  if (r === "Consider with reservations") return "warn" as const;
  return "bad" as const;
}

export function EmployerVerifier({ data }: { data: Employer | null | undefined }) {
  if (!data) return <div className="text-sm text-muted">Employer Verifier preview not available yet.</div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={recTone(data.hiring_recommendation)}>{data.hiring_recommendation}</Badge>
        <span className="text-sm text-muted">{data.role_fit_summary}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-panel/70 p-3">
          <div className="text-xs uppercase tracking-wide text-accent">Top verified skills</div>
          <ul className="mt-2 space-y-1 text-sm">
            {data.top_verified_skills.length === 0 && <li className="italic text-muted">None recorded.</li>}
            {data.top_verified_skills.map((s, i) => (
              <li key={i} className="text-ink">• {s}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-panel/70 p-3">
          <div className="text-xs uppercase tracking-wide text-bad">Biggest risks</div>
          <ul className="mt-2 space-y-1 text-sm">
            {data.biggest_risks.length === 0 && <li className="italic text-muted">None.</li>}
            {data.biggest_risks.map((s, i) => (
              <li key={i} className="text-ink">• {s}</li>
            ))}
          </ul>
        </div>
      </div>

      {data.best_evidence?.length > 0 && (
        <div className="rounded-lg border border-border bg-panel/70 p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Best evidence</div>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {data.best_evidence.map((e, i) => (
              <li key={i}>
                {e.file && <span className="mr-1 font-mono text-xs text-ink/80">{e.file}</span>}
                {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.suggested_followup_questions?.length > 0 && (
        <div className="rounded-lg border border-border bg-panel/70 p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Suggested follow-up interview questions</div>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {data.suggested_followup_questions.map((q, i) => (
              <li key={i}>{i + 1}. {q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
