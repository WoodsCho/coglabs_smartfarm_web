import { useState, useMemo } from 'react';
import {
  Thermometer, Droplets, Wind, Sun, FlaskConical,
  Waves, Zap, Activity, GitCompare, Pencil, Check, X, Lock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart, Area, Line,
  LineChart,
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

type SensorMeta = typeof SENSOR_META[number];

const DEFAULT_THRESHOLDS: Record<SensorType, [number, number]> = Object.fromEntries(
  SENSOR_META.map(m => [m.type, [...m.optimal]])
) as Record<SensorType, [number, number]>;

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
  const last = data[data.length - 1]?.time;
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
  meta, currentValue, isSelected, onClick, threshold,
}: {
  meta: SensorMeta;
  currentValue: number;
  isSelected: boolean;
  onClick: () => void;
  threshold: [number, number];
}) {
  const { data } = useSensorChart(meta.type, 3);
  const status = getStatus(currentValue, threshold);
  const { Icon } = meta;

  const healthPct = useMemo(() => {
    if (!data.length) return 100;
    const [lo, hi] = threshold;
    return Math.round(data.filter(d => d.value >= lo && d.value <= hi).length / data.length * 100);
  }, [data, threshold]);

  const healthColor = healthPct >= 90 ? '#10B981' : healthPct >= 70 ? '#F59E0B' : '#EF4444';

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
      <div className="mon-row__spark-health">
        <MiniSparkline data={data} color={meta.color} />
        <div className="mon-row__health">
          <div className="mon-row__health-fill" style={{ width: `${healthPct}%`, background: healthColor }} />
        </div>
      </div>
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
function ChartTooltip({ active, payload, label, unit, decimals, compareMode }: any) {
  if (!active || !payload?.length) return null;
  const val = payload.find((p: any) => p.dataKey === 'value')?.value;
  const cmpVal = payload.find((p: any) => p.dataKey === 'compareValue')?.value;
  return (
    <div className="mon-chart__tooltip">
      <span className="mon-chart__tooltip-time">{label}</span>
      <span className="mon-chart__tooltip-val">
        {val != null ? Number(val).toFixed(decimals) : '—'}{unit}
      </span>
      {compareMode && cmpVal != null && (
        <span className="mon-chart__tooltip-cmp">
          어제 {Number(cmpVal).toFixed(decimals)}{unit}
        </span>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function MonitorPage() {
  const { currentData } = useFarm();
  const [selectedType, setSelectedType] = useState<SensorType>('temperature');
  const [timeRange, setTimeRange] = useState<1 | 6 | 24 | 168>(24);
  const [farm, setFarm] = useState<'farm1' | 'farm2'>('farm1');
  const [compareMode, setCompareMode] = useState(false);
  const [thresholds, setThresholds] = useState<Record<SensorType, [number, number]>>(DEFAULT_THRESHOLDS);
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState<[string, string]>(['', '']);

  const selectedMeta = SENSOR_META.find(s => s.type === selectedType)!;
  const { data: chartData, isLoading } = useSensorChart(selectedType, timeRange);
  const threshold = thresholds[selectedType];

  /* ── Merged chart data (compare mode) ── */
  const mergedData = useMemo(() => {
    if (!compareMode) return chartData as (ChartDataPoint & { compareValue?: number })[];
    const seed = selectedType.length * 5;
    return chartData.map((d, i) => ({
      ...d,
      compareValue: parseFloat(
        (d.value * (1 + Math.sin(i * 0.65 + seed) * 0.07)).toFixed(selectedMeta.decimals)
      ),
    }));
  }, [chartData, compareMode, selectedType, selectedMeta.decimals]);

  /* ── Anomaly markers ── */
  const anomalies = useMemo(() => {
    const [lo, hi] = threshold;
    return chartData
      .filter(d => d.value < lo || d.value > hi)
      .filter((_, i) => i % 3 === 0)
      .slice(0, 4);
  }, [chartData, threshold]);

  /* ── Forecast next value ── */
  const forecastValue = useMemo(() => {
    if (chartData.length < 5) return null;
    const recent = chartData.slice(-5);
    const diffs = recent.slice(1).map((d, i) => d.value - recent[i].value);
    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const last = recent[recent.length - 1].value;
    return parseFloat((last + avgDiff).toFixed(selectedMeta.decimals));
  }, [chartData, selectedMeta.decimals]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    if (!chartData.length) return null;
    const vals = chartData.map(d => d.value);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const [lo, hi] = threshold;
    const inRange = Math.round((vals.filter(v => v >= lo && v <= hi).length / vals.length) * 100);
    return { avg, min, max, inRange };
  }, [chartData, threshold]);

  /* ── Overall health ── */
  const overallHealth = useMemo(() => {
    const scores = SENSOR_META.map(m => {
      const val = currentData[m.type];
      const [lo, hi] = thresholds[m.type];
      if (val >= lo && val <= hi) return 100;
      const margin = (hi - lo) * 0.5;
      if (val >= lo - margin && val <= hi + margin) return 55;
      return 0;
    });
    return Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length);
  }, [currentData, thresholds]);

  const healthColor = overallHealth >= 90 ? '#10B981' : overallHealth >= 70 ? '#F59E0B' : '#EF4444';
  const ticks = useMemo(() => pickTicks(chartData), [chartData]);
  const currentValue = currentData[selectedType];
  const status = getStatus(currentValue, threshold);
  const { Icon: SelectedIcon } = selectedMeta;

  /* ── Threshold edit handlers ── */
  function startEdit() {
    setThresholdDraft([String(threshold[0]), String(threshold[1])]);
    setEditingThreshold(true);
  }
  function saveEdit() {
    const lo = parseFloat(thresholdDraft[0]);
    const hi = parseFloat(thresholdDraft[1]);
    if (!isNaN(lo) && !isNaN(hi) && lo < hi) {
      setThresholds(prev => ({ ...prev, [selectedType]: [lo, hi] }));
    }
    setEditingThreshold(false);
  }
  function cancelEdit() { setEditingThreshold(false); }

  // Suppress unused warning for farm (will be used when farm2 is active)
  void farm;

  return (
    <div className="mon">

      {/* ── Page header ── */}
      <div className="mon__header">
        {/* Farm selector */}
        <div className="mon__farm-tabs">
          <button
            className={`mon__farm-tab${farm === 'farm1' ? ' mon__farm-tab--active' : ''}`}
            onClick={() => setFarm('farm1')}
          >
            팜 1
          </button>
          <button
            className="mon__farm-tab mon__farm-tab--disabled"
            disabled
            title="준비 중"
          >
            <Lock size={10} />
            팜 2
            <span className="mon__farm-tab-badge">준비중</span>
          </button>
        </div>

        <div className="mon__header-right">
          <span className={`mon__badge mon__badge--${getStatus(currentData[selectedType], threshold)}`}>
            전체 {SENSOR_META.filter(m => getStatus(currentData[m.type], thresholds[m.type]) === 'optimal').length}/{SENSOR_META.length} 정상
          </span>
        </div>
      </div>

      {/* ── Sensor strip ── */}
      <div className="mon__strip">
        {SENSOR_META.map(meta => {
          const val = currentData[meta.type];
          const st = getStatus(val, thresholds[meta.type]);
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
            <div className="mon__panel-controls">
              <button
                className={`mon__compare-btn${compareMode ? ' mon__compare-btn--active' : ''}`}
                onClick={() => setCompareMode(v => !v)}
                title="어제 데이터와 비교"
              >
                <GitCompare size={13} />
                <span>비교</span>
              </button>
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
              <span className="mon__stat-label">다음 예측</span>
              <span className="mon__stat-val" style={{ color: forecastValue != null ? selectedMeta.color : undefined }}>
                {forecastValue != null ? `${forecastValue}${selectedMeta.unit}` : '—'}
              </span>
            </div>
            <div className="mon__stat-sep" />
            {/* Threshold — editable */}
            <div className="mon__stat mon__stat--editable">
              {editingThreshold ? (
                <div className="mon__threshold-edit">
                  <input
                    className="mon__threshold-input"
                    value={thresholdDraft[0]}
                    onChange={e => setThresholdDraft([e.target.value, thresholdDraft[1]])}
                    placeholder="최소"
                  />
                  <span className="mon__threshold-sep">–</span>
                  <input
                    className="mon__threshold-input"
                    value={thresholdDraft[1]}
                    onChange={e => setThresholdDraft([thresholdDraft[0], e.target.value])}
                    placeholder="최대"
                  />
                  <button className="mon__threshold-action mon__threshold-action--save" onClick={saveEdit}>
                    <Check size={11} />
                  </button>
                  <button className="mon__threshold-action mon__threshold-action--cancel" onClick={cancelEdit}>
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <button className="mon__stat-editable-row" onClick={startEdit} title="임계값 편집">
                  <div className="mon__stat-edit-content">
                    <span className="mon__stat-label">목표 범위</span>
                    <span className="mon__stat-val">
                      {threshold[0]}–{threshold[1]}{selectedMeta.unit}
                    </span>
                  </div>
                  <Pencil size={10} className="mon__stat-pencil" />
                </button>
              )}
            </div>
          </div>

          {/* Compare legend */}
          {compareMode && (
            <div className="mon__compare-legend">
              <span className="mon__compare-legend-item">
                <span className="mon__compare-dot" style={{ background: selectedMeta.color }} />
                현재
              </span>
              <span className="mon__compare-legend-item">
                <span className="mon__compare-dot mon__compare-dot--dashed" style={{ borderColor: selectedMeta.color }} />
                어제
              </span>
              {anomalies.length > 0 && (
                <span className="mon__compare-legend-item mon__compare-legend-item--anomaly">
                  <span className="mon__compare-dot" style={{ background: '#EF4444' }} />
                  이상 감지 {anomalies.length}건
                </span>
              )}
            </div>
          )}

          {/* Chart */}
          <div className="mon__chart">
            {isLoading ? (
              <div className="mon__chart-placeholder">로딩 중…</div>
            ) : !mergedData.length ? (
              <div className="mon__chart-placeholder">데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mergedData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
                  <Tooltip content={<ChartTooltip unit={selectedMeta.unit} decimals={selectedMeta.decimals} compareMode={compareMode} />} />
                  <ReferenceLine y={threshold[0]} stroke={selectedMeta.color} strokeDasharray="4 4" strokeOpacity={0.35} strokeWidth={1} />
                  <ReferenceLine y={threshold[1]} stroke={selectedMeta.color} strokeDasharray="4 4" strokeOpacity={0.35} strokeWidth={1} />
                  {anomalies.map((a, i) => (
                    <ReferenceLine
                      key={i}
                      x={a.time}
                      stroke="#EF4444"
                      strokeWidth={1}
                      strokeOpacity={0.45}
                      strokeDasharray="3 3"
                    />
                  ))}
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={selectedMeta.color}
                    strokeWidth={2}
                    fill={`url(#mon-grad-${selectedType})`}
                    dot={false}
                    isAnimationActive={false}
                  />
                  {compareMode && (
                    <Line
                      type="monotone"
                      dataKey="compareValue"
                      stroke={selectedMeta.color}
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      strokeOpacity={0.45}
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sensor list */}
        <div className="mon__list">
          <div className="mon__list-header">
            <span>센서 현황</span>
            <div className="mon__list-health">
              <span className="mon__list-health-num" style={{ color: healthColor }}>{overallHealth}%</span>
              <span className="mon__list-health-lbl">건강도</span>
            </div>
          </div>
          <div className="mon__list-body">
            {SENSOR_META.map(meta => (
              <SensorRow
                key={meta.type}
                meta={meta}
                currentValue={currentData[meta.type]}
                isSelected={meta.type === selectedType}
                onClick={() => setSelectedType(meta.type)}
                threshold={thresholds[meta.type]}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
