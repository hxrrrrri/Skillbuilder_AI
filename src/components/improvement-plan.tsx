"use client";

type Plan = {
  seven_day: string[];
  thirty_day: Array<{ week: number; title: string; detail: string; files?: string[] }>;
  recommended_tests: string[];
  git_hygiene: string[];
};

export function ImprovementPlanCard({ data }: { data: Plan | null | undefined }) {
  if (!data) return <div className="text-sm text-muted">No improvement plan yet.</div>;
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-accent">7-day plan</div>
        <ul className="mt-2 space-y-1 text-sm text-ink">
          {data.seven_day.map((s, i) => <li key={i}>• {s}</li>)}
        </ul>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-accent">30-day plan</div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {data.thirty_day.map((w) => (
            <div key={w.week} className="rounded-lg border border-border bg-panel/70 p-3">
              <div className="text-xs text-muted">Week {w.week}</div>
              <div className="font-medium text-ink">{w.title}</div>
              <div className="mt-1 text-sm text-muted">{w.detail}</div>
              {w.files && w.files.length > 0 && (
                <div className="mt-2 text-xs font-mono text-muted">↳ {w.files.join(", ")}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Recommended tests</div>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {data.recommended_tests.map((t, i) => <li key={i}>• {t}</li>)}
          </ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Git hygiene</div>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {data.git_hygiene.map((t, i) => <li key={i}>• {t}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
