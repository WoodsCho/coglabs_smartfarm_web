import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { ChartDataPoint } from '../types/farm';
import './DualAxisChart.css';

interface Props {
  primaryData: ChartDataPoint[];
  secondaryData: ChartDataPoint[];
  primaryLabel: string;
  secondaryLabel: string;
  primaryColor: string;
  secondaryColor: string;
  primaryUnit: string;
  secondaryUnit: string;
}

function mergeData(
  primary: ChartDataPoint[],
  secondary: ChartDataPoint[],
) {
  const len = Math.max(primary.length, secondary.length);
  return Array.from({ length: len }, (_, i) => ({
    time: primary[i]?.time ?? secondary[i]?.time ?? '',
    primary: primary[i]?.value ?? null,
    secondary: secondary[i]?.value ?? null,
  }));
}

// X축 틱: 6개 정도만 표시
function pickTicks(data: { time: string }[]): string[] {
  if (data.length <= 6) return data.map(d => d.time);
  const step = Math.floor(data.length / 5);
  return data.filter((_, i) => i % step === 0 || i === data.length - 1).map(d => d.time);
}

const CustomTooltip = ({
  active, payload, label,
  primaryLabel, secondaryLabel, primaryUnit, secondaryUnit,
}: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="dualchart__tooltip">
      <div className="dualchart__tooltip-time">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="dualchart__tooltip-row" style={{ color: p.color }}>
          <span className="dualchart__tooltip-dot" style={{ background: p.color }} />
          <span>{p.dataKey === 'primary' ? primaryLabel : secondaryLabel}</span>
          <span className="dualchart__tooltip-val">
            {p.value != null ? p.value.toFixed(1) : '-'}
            {p.dataKey === 'primary' ? primaryUnit : secondaryUnit}
          </span>
        </div>
      ))}
    </div>
  );
};

function formatTick(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (Math.abs(v) >= 100)  return `${Math.round(v)}`;
  return `${v.toFixed(1)}`;
}

export default function DualAxisChart({
  primaryData, secondaryData,
  primaryLabel, secondaryLabel,
  primaryColor, secondaryColor,
  primaryUnit, secondaryUnit,
}: Props) {
  if (!primaryData.length && !secondaryData.length) {
    return <div className="dualchart dualchart--empty">데이터 없음</div>;
  }

  const data = mergeData(primaryData, secondaryData);
  const ticks = pickTicks(data);

  return (
    <div className="dualchart">
      <ResponsiveContainer width="100%" height={108}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>

          <CartesianGrid stroke="#f3f4f6" strokeDasharray="" vertical={false} />

          <XAxis
            dataKey="time"
            ticks={ticks}
            tick={{ fontSize: 9, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />

          <YAxis
            yAxisId="left"
            tick={{ fontSize: 9, fill: primaryColor }}
            axisLine={false}
            tickLine={false}
            width={32}
            tickCount={3}
            domain={['auto', 'auto']}
            tickFormatter={formatTick}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 9, fill: secondaryColor }}
            axisLine={false}
            tickLine={false}
            width={32}
            tickCount={3}
            domain={['auto', 'auto']}
            tickFormatter={formatTick}
          />

          <Tooltip
            content={
              <CustomTooltip
                primaryLabel={primaryLabel} secondaryLabel={secondaryLabel}
                primaryUnit={primaryUnit} secondaryUnit={secondaryUnit}
                primaryColor={primaryColor} secondaryColor={secondaryColor}
              />
            }
            cursor={{ stroke: '#e5e7eb', strokeWidth: 1 }}
          />

          <Legend
            iconType="plainline"
            iconSize={14}
            wrapperStyle={{ fontSize: 10, paddingTop: 2 }}
            formatter={(value) =>
              value === 'primary'
                ? `${primaryLabel}${primaryUnit ? ` (${primaryUnit})` : ''}`
                : `${secondaryLabel}${secondaryUnit ? ` (${secondaryUnit})` : ''}`
            }
          />

          <Line
            yAxisId="left"
            dataKey="primary"
            stroke={primaryColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            type="monotone"
            connectNulls
          />
          <Line
            yAxisId="right"
            dataKey="secondary"
            stroke={secondaryColor}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            type="monotone"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
