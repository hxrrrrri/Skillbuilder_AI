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
          <PolarGrid stroke="#34312d" />
          <PolarAngleAxis dataKey="name" tick={{ fill: "#a8a096", fontSize: 11 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#6e665d", fontSize: 10 }} />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#cf765c"
            fill="#cf765c"
            fillOpacity={0.28}
            isAnimationActive
          />
          <Tooltip
            contentStyle={{ background: "#151513", border: "1px solid #34312d", borderRadius: 8 }}
            labelStyle={{ color: "#faf9f5" }}
            itemStyle={{ color: "#cf765c" }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
