"use client";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export function SkillRadarChart({ data }: { data: Array<{ name: string; score: number }> }) {
  return (
    <ResponsiveContainer>
      <RadarChart data={data} outerRadius="78%">
        <PolarGrid stroke="#3d3d3a" />
        <PolarAngleAxis dataKey="name" tick={{ fill: "#9c9a92", fontSize: 11 }} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#87867f", fontSize: 10 }} />
        <Radar
          name="Score"
          dataKey="score"
          stroke="#d97757"
          fill="#d97757"
          fillOpacity={0.28}
          isAnimationActive
        />
        <Tooltip
          contentStyle={{ background: "#1f1e1d", border: "1px solid #3d3d3a", borderRadius: 8 }}
          labelStyle={{ color: "#faf9f5" }}
          itemStyle={{ color: "#d97757" }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
