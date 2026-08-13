'use client';

/**
 * components/RadarChart.tsx
 * 素养雷达图组件 —— 使用 Recharts 渲染五维素养雷达图。
 */
import {
  Radar,
  RadarChart as RRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

export interface RadarDatum {
  dimension: string;
  value: number; // 0-1 或 0-100，按传入数据原样展示
  full?: number; // 满分刻度，默认 1
}

interface Props {
  data: RadarDatum[];
  /** 最大刻度，默认 1（若 value 为百分比则传 1，若为 0-100 则传 100） */
  max?: number;
}

const LABEL_MAP: Record<string, string> = {
  calculation: '运算能力',
  reasoning: '推理能力',
  modeling: '模型观念',
  geometry: '空间观念',
  data: '数据观念',
  expression: '表达交流',
};

export default function RadarChart({ data, max = 1 }: Props) {
  const chartData = data.map((d) => ({
    dimension: LABEL_MAP[d.dimension] ?? d.dimension,
    value: d.value,
    full: d.full ?? max,
  }));

  return (
    <div className="w-full" style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RRadarChart data={chartData} outerRadius="70%">
          <PolarGrid />
          <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12, fill: '#374151' }} />
          <PolarRadiusAxis domain={[0, max]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
          <Radar
            name="素养得分"
            dataKey="value"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.35}
          />
          <Tooltip
            formatter={(v: number) => [(v * (max === 1 ? 100 : 1)).toFixed(0) + (max === 1 ? '%' : '分'), '得分']}
          />
        </RRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
