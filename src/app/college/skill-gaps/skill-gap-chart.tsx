"use client";

import dynamic from "next/dynamic";

type GapRow = { skill: string; weak_count: number; total_runs: number };

// Lazy-load the recharts-based chart so its JS stays out of the initial bundle.
const SkillGapChartImpl = dynamic(
  () => import("./skill-gap-chart-impl").then((m) => m.SkillGapChartImpl),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-surface/40" />,
  },
);

export function SkillGapChart({ rows }: { rows: GapRow[] }) {
  return (
    <div className="h-72 w-full">
      <SkillGapChartImpl rows={rows} />
    </div>
  );
}
