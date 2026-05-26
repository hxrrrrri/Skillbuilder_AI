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

export function SkillRadar({ data }: { data: Array<{ name: string; score: number }> }) {
  return (
    <div className="h-[380px] w-full">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="78%">
          <PolarGrid stroke="#1f2731" />
          <PolarAngleAxis dataKey="name" tick={{ fill: "#8b97a8", fontSize: 11 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#3a4453", fontSize: 10 }} />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#22d3a4"
            fill="#22d3a4"
            fillOpacity={0.28}
            isAnimationActive
          />
          <Tooltip
            contentStyle={{ background: "#0f131a", border: "1px solid #1f2731", borderRadius: 8 }}
            labelStyle={{ color: "#e6edf3" }}
            itemStyle={{ color: "#22d3a4" }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
