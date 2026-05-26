"use client";

export function TokenMeter({ raw, used }: { raw: number; used: number }) {
  const savedPct = raw > 0 ? Math.max(0, Math.min(100, (1 - used / raw) * 100)) : 0;
  const usedPct = raw > 0 ? Math.min(100, (used / raw) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-panel/70 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted">Token Budget</div>
        <div className="text-xs text-accent">{savedPct.toFixed(1)}% saved</div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent2"
          style={{ width: `${usedPct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>Analyzed: <span className="text-ink">{used.toLocaleString()}</span></span>
        <span>Raw repo: <span className="text-ink">{raw.toLocaleString()}</span></span>
      </div>
    </div>
  );
}
