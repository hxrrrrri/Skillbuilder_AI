"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type GapRow = { skill: string; weak_count: number; total_runs: number };

export function SkillGapChartImpl({ rows }: { rows: GapRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 32, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
        <XAxis dataKey="skill" tick={{ fill: "#9a948a", fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} tick={{ fill: "#9a948a", fontSize: 12 }} />
        <Tooltip contentStyle={{ background: "#171512", border: "1px solid #37312a", borderRadius: 6 }} />
        <Bar dataKey="weak_count" fill="#d98568" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
