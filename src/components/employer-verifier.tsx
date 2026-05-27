"use client";
import { Badge } from "@/components/ui/badge";

type Employer = {
  hiring_recommendation: "Strong shortlist" | "Consider with reservations" | "Needs more proof";
  top_verified_skills: string[];
  biggest_risks: string[];
  best_evidence: Array<{ file?: string; reason: string }>;
  suggested_followup_questions: string[];
  role_fit_summary: string;
  confidence?: number;
  ownership_status?: {
    confidence?: "verified" | "self_declared" | "unverified";
    owner_match?: boolean;
    repo_token_verified?: boolean;
    self_declared?: boolean;
    github_username?: string | null;
    gh_user?: string | null;
  } | null;
  verification_level?: string;
  execution_mode?: string | null;
  terminal_proof_summary?: string | null;
  shortlist_reason?: string | null;
  caution_reason?: string | null;
};

function recTone(r: Employer["hiring_recommendation"]) {
  if (r === "Strong shortlist") return "good" as const;
  if (r === "Consider with reservations") return "warn" as const;
  return "bad" as const;
}

export function EmployerVerifier({ data }: { data: Employer | null | undefined }) {
  if (!data) return <div className="text-sm text-muted">Employer Verifier preview not available yet.</div>;
  const ownership = data.ownership_status ?? null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={recTone(data.hiring_recommendation)}>{data.hiring_recommendation}</Badge>
        {data.confidence != null && (
          <Badge>confidence {Math.round(data.confidence * 100)}%</Badge>
        )}
        {data.execution_mode && <Badge>mode: {data.execution_mode}</Badge>}
        {ownership?.confidence === "verified" && <Badge tone="good">ownership: verified</Badge>}
        {ownership?.confidence === "self_declared" && <Badge tone="warn">ownership: self-declared</Badge>}
        {ownership?.confidence === "unverified" && <Badge tone="warn">ownership: unverified</Badge>}
        <span className="text-sm text-muted">{data.role_fit_summary}</span>
      </div>

      {(data.shortlist_reason || data.caution_reason) && (
        <div className="rounded-lg border border-border bg-panel/70 p-3 text-sm">
          {data.shortlist_reason && (
            <div>
              <span className="font-semibold text-good">Why shortlist: </span>
              <span className="text-ink/80">{data.shortlist_reason}</span>
            </div>
          )}
          {data.caution_reason && (
            <div>
              <span className="font-semibold text-bad">Caution: </span>
              <span className="text-ink/80">{data.caution_reason}</span>
            </div>
          )}
        </div>
      )}

      {data.terminal_proof_summary && (
        <div className="rounded-lg border border-border bg-panel/70 p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted">Terminal proof summary</div>
          <div className="mt-1 font-mono text-xs text-ink/80">{data.terminal_proof_summary}</div>
        </div>
      )}

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
