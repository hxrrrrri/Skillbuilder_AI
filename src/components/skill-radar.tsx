"use client";
import dynamic from "next/dynamic";

// Lazy-load the recharts-based chart so its JS stays out of the initial bundle.
const SkillRadarChart = dynamic(
  () => import("./skill-radar-chart").then((m) => m.SkillRadarChart),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-surface/40" />,
  },
);

export function SkillRadar({ data }: { data: Array<{ name: string; score: number }> }) {
  return (
    <div className="h-[380px] w-full">
      <SkillRadarChart data={data} />
    </div>
  );
}
