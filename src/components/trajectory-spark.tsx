import { Badge } from "@/components/ui/badge";

export type TrajectoryDelta = {
  id: string;
  createdAt: Date;
  previousScore: number | null;
  nextScore: number | null;
  deltaJson: string | null;
};

function safeParse(s: string | null): Record<string, { before: number | null; after: number | null }> {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function diff(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return b - a;
}

function MiniSpark({ before, after }: { before: number | null; after: number | null }) {
  if (before == null || after == null) return null;
  const w = 60;
  const h = 18;
  const max = Math.max(before, after, 50);
  const y = (v: number) => h - (v / max) * h;
  const path = `M0,${y(before)} L${w},${y(after)}`;
  return (
    <svg width={w} height={h} className="overflow-visible">
      <line x1="0" y1={h} x2={w} y2={h} stroke="currentColor" opacity="0.15" />
      <path d={path} stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx={0} cy={y(before)} r="2" fill="currentColor" opacity="0.5" />
      <circle cx={w} cy={y(after)} r="2.5" fill="currentColor" />
    </svg>
  );
}

export function TrajectorySpark({ snapshots }: { snapshots: TrajectoryDelta[] }) {
  if (snapshots.length === 0) return null;
  const latest = snapshots[0];
  const skillDelta = safeParse(latest.deltaJson);
  const skillEntries = Object.entries(skillDelta)
    .filter(([, v]) => diff(v.before, v.after) !== null && diff(v.before, v.after) !== 0)
    .sort((a, b) => Math.abs(diff(b[1].before, b[1].after) ?? 0) - Math.abs(diff(a[1].before, a[1].after) ?? 0))
    .slice(0, 4);

  const overallDelta = diff(latest.previousScore, latest.nextScore);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Re-verification trajectory</span>
        {overallDelta != null && (
          <Badge tone={overallDelta > 0 ? "good" : overallDelta < 0 ? "bad" : "default"}>
            overall {latest.previousScore} → {latest.nextScore} ({overallDelta >= 0 ? "+" : ""}
            {overallDelta})
          </Badge>
        )}
        <span className="text-accent">
          <MiniSpark before={latest.previousScore} after={latest.nextScore} />
        </span>
        <span className="text-muted">·  {snapshots.length} snapshot{snapshots.length === 1 ? "" : "s"}</span>
      </div>
      {skillEntries.length > 0 && (
        <ul className="grid gap-1 sm:grid-cols-2">
          {skillEntries.map(([skill, v]) => {
            const d = diff(v.before, v.after) ?? 0;
            return (
              <li key={skill} className="flex items-center justify-between rounded border border-border bg-panel2/40 px-2 py-1 text-xs">
                <span className="text-ink">{skill}</span>
                <span className={d > 0 ? "text-good" : d < 0 ? "text-bad" : "text-muted"}>
                  {v.before ?? "—"} → {v.after ?? "—"} ({d >= 0 ? "+" : ""}
                  {d})
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
