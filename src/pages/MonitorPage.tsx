import { useState, useMemo } from 'react';
import {
  Thermometer, Droplets, Wind, Sun, FlaskConical,
  Waves, Zap, Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart, Area,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { useSensorChart } from '../hooks/useSensorChartData';
import { useFarm } from '../contexts/FarmContext';
import type { SensorType, ChartDataPoint } from '../types/farm';
import './MonitorPage.css';

/* ── Sensor metadata ─────────────────────────────────────────── */
const SENSOR_META = [
  { type: 'temperature' as SensorType, label: '온도', unit: '°C', Icon: Thermometer, color: '#EF4444', optimal: [18, 26] as [number, number], decimals: 1 },
  { type: 'humidity' as SensorType, label: '습도', unit: '%', Icon: Droplets, color: '#3B82F6', optimal: [60, 80] as [number, number], decimals: 0 },
  { type: 'co2' as SensorType, label: 'CO₂', unit: 'ppm', Icon: Wind, color: '#10B981', optimal: [800, 1200] as [number, number], decimals: 0 },
  { type: 'light' as SensorType, label: '조도', unit: '%', Icon: Sun, color: '#EAB308', optimal: [60, 100] as [number, number], decimals: 0 },
  { type: 'ph' as SensorType, label: 'pH', unit: '', Icon: FlaskConical, color: '#8B5CF6', optimal: [5.5, 6.5] as [number, number], decimals: 1 },
  { type: 'ec' as SensorType, label: 'EC', unit: 'dS/m', Icon: Zap, color: '#EC4899', optimal: [1.5, 2.5] as [number, number], decimals: 1 },
  { type: 'waterTemp' as SensorType, label: '수온', unit: '°C', Icon: Waves, color: '#F97316', optimal: [18, 24] as [number, number], decimals: 1 },
  { type: 'oxygenLevel' as SensorType, label: '용존산소', unit: 'mg/L', Icon: Activity, color: '#06B6D4', optimal: [6, 9] as [number, number], decimals: 1 },
] as const;

const TIME_RANGES = [
  { label: '1H', hours: 1 },
  { label: '6H', hours: 6 },
  { label: '24H', hours: 24 },
  { label: '7D', hours: 168 },
] as const;

/* ── Helpers ─────────────────────────────────────────────────── */
type Status = 'optimal' | 'warning' | 'critical';

function getStatus(value: number, [lo, hi]: [number, number]): Status {
  if (value >= lo && value <= hi) return 'optimal';
  const margin = (hi - lo) * 0.15;
  if (value >= lo - margin && value <= hi + margin) return 'warning';
  return 'critical';
}

function pickTicks(data: ChartDataPoint[], n = 6): string[] {
  if (data.length <= n) return data.map(d => d.time);
  const step = Math.floor(data.length / (n - 1));
  const ticks = data.filter((_, i) => i % step === 0).map(d => d.time);
  const last = data.at(-1)?.time;
  if (last && !ticks.includes(last)) ticks.push(last);
  return ticks;
}

/* ── Mini Sparkline ──────────────────────────────────────────── */
function MiniSparkline({ data, color }: { data: ChartDataPoint[]; color: string }) {
  if (!data.length) return <div className="mon-spark" />;
  return (
    <div className="mon-spark">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Sensor Row (right panel) ────────────────────────────────── */
function SensorRow({
  meta, currentValue, isSelected, onClick,
}: {
  meta: typeof SENSOR_META[number];
  currentValue: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { data } = useSensorChart(meta.type, 3);
  const status = getStatus(currentValue, meta.optimal);
  const { Icon } = meta;

  return (
    <button
      className={`mon-row${isSelected ? ' mon-row--selected' : ''}`}
      style={isSelected ? { borderLeftColor: meta.color } : undefined}
      onClick={onClick}
    >
      <span className="mon-row__icon" style={{ color: meta.color }}>
        <Icon size={13} />
      </span>
      <div className="mon-row__info">
        <span className="mon-row__label">{meta.label}</span>
        <span className={`mon-row__status mon-row__status--${status}`}>
          {status === 'optimal' ? '정상' : status === 'warning' ? '주의' : '경고'}
        </span>
      </div>
      <MiniSparkline data={data} color={meta.color} />
      <div className="mon-row__val">
        <span className="mon-row__num" style={{ color: isSelected ? meta.color : undefined }}>
          {currentValue.toFixed(meta.decimals)}
        </span>
        {meta.unit && <span className="mon-row__unit">{meta.unit}</span>}
      </div>
    </button>
  );
}

/* ── Main Chart Tooltip ──────────────────────────────────────── */
function ChartTooltip({ active, payload, label, unit, decimals }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div className="mon-chart__tooltip">
      <span className="mon-chart__tooltip-time">{label}</span>
      <span className="mon-chart__tooltip-val">
        {val != null ? Number(val).toFixed(decimals) : '—'}{unit}
      </span>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function MonitorPage() {
  const { currentData } = useFarm();
  const [selectedType, setSelectedType] = useState<SensorType>('temperature');
  const [timeRange, setTimeRange] = useState<1 | 6 | 24 | 168>(24);

  const selectedMeta = SENSOR_META.find(s => s.type === selectedType)!;
  const { data: chartData, isLoading } = useSensorChart(selectedType, timeRange);

  const stats = useMemo(() => {
    if (!chartData.length) return null;
    const vals = chartData.map(d => d.value);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const [lo, hi] = selectedMeta.optimal;
    const inRange = Math.round((vals.filter(v => v >= lo && v <= hi).length / vals.length) * 100);
    return { avg, min, max, inRange };
  }, [chartData, selectedMeta]);

  const ticks = useMemo(() => pickTicks(chartData), [chartData]);
  const currentValue = currentData[selectedType];
  const status = getStatus(currentValue, selectedMeta.optimal);
  const { Icon: SelectedIcon } = selectedMeta;

  return (
    <div className="mon">

      {/* ── Sensor strip ── */}
      <div className="mon__strip">
        {SENSOR_META.map(meta => {
          const val = currentData[meta.type];
          const st = getStatus(val, meta.optimal);
          const { Icon } = meta;
          const isSel = meta.type === selectedType;
          return (
            <button
              key={meta.type}
              className={`mon-chip${isSel ? ' mon-chip--active' : ''}`}
              style={isSel ? { borderColor: meta.color } : undefined}
              onClick={() => setSelectedType(meta.type)}
            >
              <div className="mon-chip__top">
                <span className="mon-chip__label">{meta.label}</span>
                <span className={`mon-chip__dot mon-chip__dot--${st}`} />
              </div>
              <div className="mon-chip__bottom">
                <span className="mon-chip__val" style={{ color: isSel ? meta.color : undefined }}>
                  {val.toFixed(meta.decimals)}
                </span>
                {meta.unit && <span className="mon-chip__unit">{meta.unit}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Main body ── */}
      <div className="mon__body">

        {/* Chart panel */}
        <div className="mon__panel">

          {/* Header */}
          <div className="mon__panel-header">
            <div className="mon__panel-title">
              <span className="mon__panel-icon" style={{ color: selectedMeta.color }}>
                <SelectedIcon size={16} />
              </span>
              <span className="mon__panel-name">{selectedMeta.label}</span>
              {selectedMeta.unit && <span className="mon__panel-unit">{selectedMeta.unit}</span>}
              <span className={`mon__badge mon__badge--${status}`}>
                {status === 'optimal' ? '정상' : status === 'warning' ? '주의' : '경고'}
              </span>
            </div>
            <div className="mon__time-tabs">
              {TIME_RANGES.map(t => (
                <button
                  key={t.hours}
                  className={`mon__tab${timeRange === t.hours ? ' mon__tab--active' : ''}`}
                  onClick={() => setTimeRange(t.hours as 1 | 6 | 24 | 168)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats bar */}
          <div className="mon__stats">
            <div className="mon__stat">
              <span className="mon__stat-label">현재</span>
              <span className="mon__stat-val" style={{ color: selectedMeta.color }}>
                {currentValue.toFixed(selectedMeta.decimals)}{selectedMeta.unit}
              </span>
            </div>
            <div className="mon__stat-sep" />
            <div className="mon__stat">
              <span className="mon__stat-label">평균</span>
              <span className="mon__stat-val">
                {stats ? stats.avg.toFixed(selectedMeta.decimals) : '—'}{selectedMeta.unit}
              </span>
            </div>
            <div className="mon__stat-sep" />
            <div className="mon__stat">
              <span className="mon__stat-label">최저</span>
              <span className="mon__stat-val">
                {stats ? stats.min.toFixed(selectedMeta.decimals) : '—'}{selectedMeta.unit}
              </span>
            </div>
            <div className="mon__stat-sep" />
            <div className="mon__stat">
              <span className="mon__stat-label">최고</span>
              <span className="mon__stat-val">
                {stats ? stats.max.toFixed(selectedMeta.decimals) : '—'}{selectedMeta.unit}
              </span>
            </div>
            <div className="mon__stat-sep" />
            <div className="mon__stat">
              <span className="mon__stat-label">정상 범위</span>
              <span className="mon__stat-val">{stats ? `${stats.inRange}%` : '—'}</span>
            </div>
            <div className="mon__stat-sep" />
            <div className="mon__stat">
              <span className="mon__stat-label">목표</span>
              <span className="mon__stat-val">
                {selectedMeta.optimal[0]}–{selectedMeta.optimal[1]}{selectedMeta.unit}
              </span>
            </div>
          </div>

          {/* Chart */}
          <div className="mon__chart">
            {isLoading ? (
              <div className="mon__chart-placeholder">로딩 중…</div>
            ) : !chartData.length ? (
              <div className="mon__chart-placeholder">데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`mon-grad-${selectedType}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={selectedMeta.color} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={selectedMeta.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#F3F4F6" strokeDasharray="" vertical={false} />
                  <XAxis
                    dataKey="time"
                    ticks={ticks}
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    axisLine={false} tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    axisLine={false} tickLine={false}
                    width={38}
                  />
                  <Tooltip content={<ChartTooltip unit={selectedMeta.unit} decimals={selectedMeta.decimals} />} />
                  <ReferenceLine y={selectedMeta.optimal[0]} stroke={selectedMeta.color} strokeDasharray="4 4" strokeOpacity={0.35} strokeWidth={1} />
                  <ReferenceLine y={selectedMeta.optimal[1]} stroke={selectedMeta.color} strokeDasharray="4 4" strokeOpacity={0.35} strokeWidth={1} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={selectedMeta.color}
                    strokeWidth={2}
                    fill={`url(#mon-grad-${selectedType})`}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sensor list */}
        <div className="mon__list">
          <div className="mon__list-header">센서 현황</div>
          <div className="mon__list-body">
            {SENSOR_META.map(meta => (
              <SensorRow
                key={meta.type}
                meta={meta}
                currentValue={currentData[meta.type]}
                isSelected={meta.type === selectedType}
                onClick={() => setSelectedType(meta.type)}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
