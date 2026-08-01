import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { DifficultyFeatureVector } from "../../shared/types/osu";

const dimensions: Array<{
  key: keyof DifficultyFeatureVector;
  label: string;
}> = [
  { key: "aim", label: "Aim" },
  { key: "speed", label: "Speed" },
  { key: "reading", label: "Reading" },
  { key: "flashlight", label: "Flashlight" },
  { key: "overlap", label: "Overlap" },
];

export function SimilarityRadar({
  target,
  comparison,
  compact = false,
}: {
  target: DifficultyFeatureVector;
  comparison?: DifficultyFeatureVector | null;
  compact?: boolean;
}) {
  const data = dimensions.map(({ key, label }) => ({
    dimension: label,
    target: target[key],
    comparison: comparison?.[key] ?? 0,
  }));

  return (
    <div className={compact ? "h-56" : "h-72"}>
      <ResponsiveContainer height="100%" width="100%">
        <RadarChart data={data} outerRadius={compact ? "68%" : "72%"}>
          <PolarGrid gridType="polygon" radialLines stroke="rgba(0,0,0,.72)" strokeWidth={1.35} />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
          />
          <PolarRadiusAxis
            axisLine={false}
            domain={[0, 1]}
            tick={false}
            tickCount={3}
          />
          <Radar
            dataKey="target"
            fill="var(--theme-primary)"
            fillOpacity={0.18}
            name="参考谱面"
            stroke="var(--theme-primary)"
            strokeWidth={2}
          />
          {comparison ? (
            <Radar
              dataKey="comparison"
              fill="#f472b6"
              fillOpacity={0.12}
              name="候选谱面"
              stroke="#f472b6"
              strokeWidth={2}
            />
          ) : null}
          {comparison ? (
            <Legend
              iconSize={8}
              wrapperStyle={{ color: "#94a3b8", fontSize: 11 }}
            />
          ) : null}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
