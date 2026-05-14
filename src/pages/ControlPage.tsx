import { useState, useMemo, useCallback, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Lightbulb, Wind, Droplets, Thermometer, CloudCog,
  Power, RefreshCw, ChevronDown, ChevronUp,
  Clock, History, AlertCircle, Zap, X,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
} from 'recharts';
import { useFarm } from '../contexts/FarmContext';
import { environmentApi } from '../api/environment';
import type { Equipment, EquipmentGroup } from '../types/farm';
import './ControlPage.css';

/* ── Constants ───────────────────────────────────────────────── */
const STATUS_ACTIVE = new Set(['ON', 'ACTIVE', 'RUNNING']);
const REAL_EQUIPMENT_IDS = new Set([1, 2, 3, 6, 7, 9, 11, 12, 13]);

const GROUP_META: Record<string, { Icon: LucideIcon; color: string }> = {
  led: { Icon: Lightbulb, color: '#F59E0B' },
  fan: { Icon: Wind, color: '#3B82F6' },
  pump: { Icon: Droplets, color: '#10B981' },
  heater: { Icon: Thermometer, color: '#EF4444' },
  co2: { Icon: CloudCog, color: '#8B5CF6' },
};

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  ON: { label: 'ON', color: '#16A34A', bg: '#DCFCE7' },
  ACTIVE: { label: 'ACTIVE', color: '#16A34A', bg: '#DCFCE7' },
  RUNNING: { label: 'RUNNING', color: '#1D4ED8', bg: '#DBEAFE' },
  STANDBY: { label: 'STANDBY', color: '#B45309', bg: '#FEF9C3' },
  OFF: { label: 'OFF', color: '#DC2626', bg: '#FEE2E2' },
};
const DEFAULT_STATUS_META = { label: '—', color: '#6B7280', bg: '#F3F4F6' };

/* ── Mock data helpers ───────────────────────────────────────── */
function mockKwh(id: number): number {
  return parseFloat(((id * 1.73 + 0.5) % 8.5 + 1.2).toFixed(1));
}
// 실제 매핑 장비(1,2,6,7,9,11,12,13)는 0, 가상 장비에만 총 8개 분배
const ERROR_MAP: Record<number, number> = { 4: 3, 5: 1, 8: 2, 10: 2 };
function mockErrors(id: number): number {
  return ERROR_MAP[id] ?? 0;
}
function mockLastErrorDate(id: number): string | null {
  if (!mockErrors(id)) return null;
  const d = new Date(2025, 3, 10);
  d.setDate(d.getDate() - ((id * 3) % 30));
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
function defaultSchedule(groupType: string): number[] {
  switch (groupType) {
    case 'led': return Array.from({ length: 14 }, (_, i) => i + 6);
    case 'fan': return Array.from({ length: 12 }, (_, i) => i + 8);
    case 'pump': return [7, 8, 12, 13, 17, 18];
    case 'heater': return [0, 1, 2, 3, 4, 5, 22, 23];
    case 'co2': return Array.from({ length: 10 }, (_, i) => i + 8);
    default: return [];
  }
}
function mockHistory(eqId: number) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const uptimeH = Math.round(((eqId * 3 + i * 5) % 18) + 4);
    return {
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      uptimeH,
      pct: Math.round((uptimeH / 24) * 100),
    };
  });
}

/* ── Env progress bar ────────────────────────────────────────── */
function EnvProgress({ envValue, target, unit }: { envValue: number; target: number; unit: string }) {
  const max = target * 1.8;
  const envPct = Math.min(Math.round((envValue / max) * 100), 100);
  const targetPct = Math.min(Math.round((target / max) * 100), 100);
  const ratio = envValue / target;
  const color = ratio >= 0.9 && ratio <= 1.1 ? '#10B981'
    : ratio >= 0.75 && ratio <= 1.25 ? '#F59E0B'
      : '#EF4444';
  return (
    <div className="ctrl-env">
      <div className="ctrl-env__bar">
        <div className="ctrl-env__fill" style={{ width: `${envPct}%`, background: color }} />
        <div className="ctrl-env__marker" style={{ left: `${targetPct}%` }} />
      </div>
      <span className="ctrl-env__label" style={{ color }}>
        {envValue}{unit}
      </span>
    </div>
  );
}

/* ── Target slider ───────────────────────────────────────────── */
function TargetSlider({ eq, onUpdate }: { eq: Equipment; onUpdate: (v: number) => void }) {
  const base = eq.target!;
  const min = parseFloat((base * 0.5).toFixed(1));
  const max = parseFloat((base * 1.5).toFixed(1));
  return (
    <div className="ctrl-slider-wrap">
      <input
        type="range"
        className="ctrl-slider"
        min={min} max={max} step={0.5}
        value={eq.target!}
        onChange={e => onUpdate(+e.target.value)}
      />
      <span className="ctrl-slider__val">{eq.target}{eq.unit}</span>
    </div>
  );
}

/* ── Scheduler expanded section ──────────────────────────────── */
function SchedulerSection({
  eq, groupType, scheduleOverrides, onToggle,
}: {
  eq: Equipment;
  groupType: string;
  scheduleOverrides: Record<number, number[]>;
  onToggle: (eqId: number, groupType: string, h: number) => void;
}) {
  const schedule = scheduleOverrides[eq.id] ?? defaultSchedule(groupType);
  const onSet = new Set(schedule);

  return (
    <div className="ctrl-sched">
      <div className="ctrl-sched__header">
        <Clock size={11} />
        <span>24시간 자동 스케줄</span>
        <span className="ctrl-sched__count">{schedule.length}h ON</span>
      </div>
      <div className="ctrl-sched__grid">
        {Array.from({ length: 24 }, (_, h) => (
          <button
            key={h}
            className={`ctrl-sched__cell${onSet.has(h) ? ' ctrl-sched__cell--on' : ''}`}
            onClick={() => onToggle(eq.id, groupType, h)}
            title={`${String(h).padStart(2, '0')}:00`}
          />
        ))}
      </div>
      <div className="ctrl-sched__xlabels">
        {[0, 6, 12, 18, 23].map(h => (
          <span key={h}>{h}h</span>
        ))}
      </div>
    </div>
  );
}

/* ── Equipment Row ───────────────────────────────────────────── */
function EquipmentRow({
  eq, groupColor, groupType,
  scheduleOpenId, onToggleScheduler,
  scheduleOverrides, onToggleSchedule,
  onOpenHistory, heatPumpTodayKwh,
}: {
  eq: Equipment;
  groupColor: string;
  groupType: string;
  scheduleOpenId: number | null;
  onToggleScheduler: (id: number) => void;
  scheduleOverrides: Record<number, number[]>;
  onToggleSchedule: (eqId: number, groupType: string, h: number) => void;
  onOpenHistory: (eq: Equipment) => void;
  heatPumpTodayKwh: number | null;
}) {
  const { toggleEquipmentStatus, toggleEquipmentAuto, updateEquipmentTarget, currentData } = useFarm();
  const [controlling, setControlling] = useState(false);

  const isActive = STATUS_ACTIVE.has(eq.status);
  const isVirtual = !REAL_EQUIPMENT_IDS.has(eq.id);
  const st = STATUS_LABEL[eq.status] ?? DEFAULT_STATUS_META;
  const hasTarget = eq.target != null && eq.unit != null;
  const errors = mockErrors(eq.id);
  const isHeatPump = eq.id === 9;
  const liveKw = isHeatPump && currentData.heatPumpPower != null
    ? parseFloat((currentData.heatPumpPower / 1000).toFixed(2))
    : mockKwh(eq.id);
  const isSchedOpen = scheduleOpenId === eq.id;

  const handleToggle = async () => {
    if (controlling) return;
    setControlling(true);
    try { await toggleEquipmentStatus(eq.id, isActive ? 'OFF' : 'ON'); }
    finally { setControlling(false); }
  };

  return (
    <>
      <div className={`ctrl-row${isVirtual ? ' ctrl-row--virtual' : ''}`}>
        {/* Status dot */}
        <span className="ctrl-row__dot" style={{ background: st.color }} />

        {/* Name + badges */}
        <div className="ctrl-row__name">
          <span className="ctrl-row__name-text">{eq.name}</span>
          {isVirtual && <span className="ctrl-row__tag ctrl-row__tag--virtual">가상</span>}
          {errors > 0 && (
            <span className="ctrl-row__tag ctrl-row__tag--error" title={`오류 ${errors}회`}>
              {errors}
            </span>
          )}
        </div>

        {/* Status badge */}
        <span className="ctrl-row__status" style={{ color: st.color, background: st.bg }}>
          {st.label}
        </span>

        {/* Env progress bar */}
        {hasTarget && eq.envValue != null ? (
          <EnvProgress envValue={eq.envValue} target={eq.target!} unit={eq.unit!} />
        ) : (
          <div className="ctrl-row__env-empty" />
        )}

        {/* Target slider */}
        {hasTarget ? (
          <TargetSlider eq={eq} onUpdate={v => updateEquipmentTarget(eq.id, v)} />
        ) : (
          <div className="ctrl-row__slider-empty" />
        )}

        {/* 실시간 kW */}
        <div className="ctrl-row__kwh">
          <Zap size={10} style={{ color: '#F59E0B' }} />
          <span>{liveKw} kW</span>
        </div>

        {/* 오늘 kWh */}
        <div className="ctrl-row__kwh-today">
          {isHeatPump && heatPumpTodayKwh != null
            ? <span>{heatPumpTodayKwh} kWh</span>
            : <span className="ctrl-row__kwh-today--mock">{mockKwh(eq.id)} kWh</span>}
        </div>

        {/* Mode toggle */}
        <button
          className={`ctrl-row__mode${eq.auto ? ' ctrl-row__mode--auto' : ' ctrl-row__mode--manual'}`}
          onClick={() => toggleEquipmentAuto(eq.id, !eq.auto)}
        >
          {eq.auto ? '자동' : '수동'}
        </button>

        {/* Power */}
        <button
          className={`ctrl-row__power${isActive ? ' ctrl-row__power--on' : ' ctrl-row__power--off'}${controlling ? ' ctrl-row__power--loading' : ''}`}
          onClick={handleToggle}
          disabled={controlling}
          style={isActive ? { background: groupColor, borderColor: groupColor } : undefined}
        >
          {controlling
            ? <RefreshCw size={13} className="ctrl-row__spin" />
            : <Power size={13} />}
          <span>{isActive ? 'ON' : 'OFF'}</span>
        </button>

        {/* Action buttons */}
        <div className="ctrl-row__actions">
          <button
            className={`ctrl-row__act-btn${isSchedOpen ? ' ctrl-row__act-btn--active' : ''}`}
            onClick={() => onToggleScheduler(eq.id)}
            title="스케줄 설정"
          >
            <Clock size={12} />
          </button>
          <button
            className="ctrl-row__act-btn"
            onClick={() => onOpenHistory(eq)}
            title="가동 이력"
          >
            <History size={12} />
          </button>
        </div>
      </div>

      {/* Scheduler expanded */}
      {isSchedOpen && (
        <SchedulerSection
          eq={eq}
          groupType={groupType}
          scheduleOverrides={scheduleOverrides}
          onToggle={onToggleSchedule}
        />
      )}
    </>
  );
}

/* ── Group Card ──────────────────────────────────────────────── */
function GroupCard({
  group, scheduleOpenId, onToggleScheduler,
  scheduleOverrides, onToggleSchedule, onOpenHistory, heatPumpTodayKwh,
}: {
  group: EquipmentGroup;
  scheduleOpenId: number | null;
  onToggleScheduler: (id: number) => void;
  scheduleOverrides: Record<number, number[]>;
  onToggleSchedule: (eqId: number, groupType: string, h: number) => void;
  onOpenHistory: (eq: Equipment) => void;
  heatPumpTodayKwh: number | null;
}) {
  const { toggleEquipmentStatus, toggleEquipmentAuto } = useFarm();
  const [collapsed, setCollapsed] = useState(false);
  const [bulking, setBulking] = useState(false);

  const meta = GROUP_META[group.type] ?? { Icon: CloudCog, color: '#9CA3AF' };
  const { Icon } = meta;
  const active = group.equipment.filter(e => STATUS_ACTIVE.has(e.status)).length;
  const total = group.equipment.length;

  const bulkControl = async (action: 'on' | 'off' | 'auto') => {
    setBulking(true);
    try {
      for (const eq of group.equipment) {
        if (action === 'auto') {
          toggleEquipmentAuto(eq.id, true);
        } else {
          await toggleEquipmentStatus(eq.id, action === 'on' ? 'ON' : 'OFF');
        }
      }
    } finally {
      setBulking(false);
    }
  };

  return (
    <div className="ctrl-card">
      <div className="ctrl-card__header">
        <button className="ctrl-card__toggle" onClick={() => setCollapsed(c => !c)}>
          <div className="ctrl-card__title">
            <span className="ctrl-card__icon" style={{ color: meta.color, background: `${meta.color}18` }}>
              <Icon size={15} />
            </span>
            <span className="ctrl-card__name">{group.displayName}</span>
            <span className="ctrl-card__count">{active}/{total}</span>
          </div>
          <span className="ctrl-card__chevron">
            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </span>
        </button>

        {/* Bulk control */}
        <div className="ctrl-card__bulk">
          <button
            className="ctrl-bulk ctrl-bulk--on"
            onClick={() => bulkControl('on')}
            disabled={bulking}
          >전체 ON</button>
          <button
            className="ctrl-bulk ctrl-bulk--off"
            onClick={() => bulkControl('off')}
            disabled={bulking}
          >전체 OFF</button>
          <button
            className="ctrl-bulk ctrl-bulk--auto"
            onClick={() => bulkControl('auto')}
            disabled={bulking}
          >자동</button>
        </div>
      </div>

      {!collapsed && (
        <div className="ctrl-card__body">
          <div className="ctrl-col-header">
            <span />
            <span>장비명</span>
            <span>상태</span>
            <span>환경 현황</span>
            <span>목표 조정</span>
            <span>전력 (kW)</span>
            <span>사용량 (kWh)</span>
            <span>모드</span>
            <span>제어</span>
            <span />
          </div>
          {group.equipment.map(eq => (
            <EquipmentRow
              key={eq.id}
              eq={eq}
              groupColor={meta.color}
              groupType={group.type}
              scheduleOpenId={scheduleOpenId}
              onToggleScheduler={onToggleScheduler}
              scheduleOverrides={scheduleOverrides}
              onToggleSchedule={onToggleSchedule}
              onOpenHistory={onOpenHistory}
              heatPumpTodayKwh={heatPumpTodayKwh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── History Side Panel ──────────────────────────────────────── */
function HistoryPanel({ eq, onClose }: { eq: Equipment; onClose: () => void }) {
  const history = useMemo(() => mockHistory(eq.id), [eq.id]);
  const avgUptime = Math.round(history.reduce((a, b) => a + b.uptimeH, 0) / 7);
  const totalH = history.reduce((a, b) => a + b.uptimeH, 0);
  const errors = mockErrors(eq.id);
  const lastError = mockLastErrorDate(eq.id);

  return (
    <div className="ctrl-side">
      <div className="ctrl-side__head">
        <div className="ctrl-side__title">
          <History size={13} />
          <span>{eq.name}</span>
        </div>
        <button className="ctrl-side__close" onClick={onClose}>
          <X size={13} />
        </button>
      </div>

      <div className="ctrl-side__body">
        {/* Stats */}
        <div className="ctrl-side__stats">
          <div className="ctrl-side__stat">
            <span className="ctrl-side__num">{avgUptime}h</span>
            <span className="ctrl-side__lbl">일평균 가동</span>
          </div>
          <div className="ctrl-side__sep" />
          <div className="ctrl-side__stat">
            <span className="ctrl-side__num">{totalH}h</span>
            <span className="ctrl-side__lbl">7일 합계</span>
          </div>
          {errors > 0 && (
            <>
              <div className="ctrl-side__sep" />
              <div className="ctrl-side__stat">
                <span className="ctrl-side__num ctrl-side__num--error">{errors}</span>
                <span className="ctrl-side__lbl">응답 오류</span>
              </div>
            </>
          )}
        </div>

        {/* 7-day history */}
        <div className="ctrl-side__section">
          <span className="ctrl-side__section-title">7일 가동 이력</span>
          <div className="ctrl-side__history">
            {history.map(d => (
              <div key={d.date} className="ctrl-side__hist-row">
                <span className="ctrl-side__hist-date">{d.date}</span>
                <div className="ctrl-side__hist-bar">
                  <div
                    className="ctrl-side__hist-fill"
                    style={{
                      width: `${d.pct}%`,
                      background: d.pct >= 75 ? '#10B981' : d.pct >= 50 ? '#F59E0B' : '#EF4444',
                    }}
                  />
                </div>
                <span className="ctrl-side__hist-val">{d.uptimeH}h</span>
              </div>
            ))}
          </div>
        </div>

        {/* Error history */}
        {lastError && (
          <div className="ctrl-side__section">
            <span className="ctrl-side__section-title">이상 이력</span>
            <div className="ctrl-side__error">
              <AlertCircle size={12} color="#EF4444" />
              <div className="ctrl-side__error-info">
                <span className="ctrl-side__error-date">마지막 오류: {lastError}</span>
                <span className="ctrl-side__error-count">응답 없음 {errors}회</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Energy Panel ────────────────────────────────────────────── */
function EnergyPanel({ groups }: { groups: EquipmentGroup[] }) {
  const pieData = useMemo(() =>
    groups.map(g => ({
      name: g.displayName,
      value: parseFloat(g.equipment.reduce((s, eq) => s + mockKwh(eq.id), 0).toFixed(1)),
      color: GROUP_META[g.type]?.color ?? '#9CA3AF',
    }))
    , [groups]);

  const total = parseFloat(pieData.reduce((s, d) => s + d.value, 0).toFixed(1));

  return (
    <div className="ctrl-energy">
      <div className="ctrl-energy__pie">
        <ResponsiveContainer width={100} height={100}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%" cy="50%"
              innerRadius={28} outerRadius={44}
              dataKey="value"
              strokeWidth={0}
            >
              {pieData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <ReTooltip
              formatter={(v) => [`${v} kWh`]}
              contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #E5E7EB' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="ctrl-energy__total">
          <span className="ctrl-energy__total-num">{total}</span>
          <span className="ctrl-energy__total-unit">kWh</span>
        </div>
      </div>

      <div className="ctrl-energy__list">
        {pieData.map(d => (
          <div key={d.name} className="ctrl-energy__item">
            <span className="ctrl-energy__dot" style={{ background: d.color }} />
            <span className="ctrl-energy__name">{d.name}</span>
            <span className="ctrl-energy__val">{d.value} kWh</span>
          </div>
        ))}
      </div>

      <div className="ctrl-energy__eq-list">
        {groups.flatMap(g =>
          g.equipment.map(eq => ({
            eq,
            color: GROUP_META[g.type]?.color ?? '#9CA3AF',
            kwh: mockKwh(eq.id),
          }))
        ).sort((a, b) => b.kwh - a.kwh).slice(0, 6).map(({ eq, color, kwh }) => (
          <div key={eq.id} className="ctrl-energy__eq-row">
            <span className="ctrl-energy__eq-dot" style={{ background: color }} />
            <span className="ctrl-energy__eq-name">{eq.name}</span>
            <div className="ctrl-energy__eq-bar">
              <div
                className="ctrl-energy__eq-fill"
                style={{ width: `${Math.round((kwh / 12) * 100)}%`, background: color }}
              />
            </div>
            <span className="ctrl-energy__eq-kwh">{kwh}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Summary Bar ─────────────────────────────────────────────── */
function SummaryBar({
  groups, filter, onFilter, showEnergy, onToggleEnergy,
}: {
  groups: EquipmentGroup[];
  filter: string;
  onFilter: (t: string) => void;
  showEnergy: boolean;
  onToggleEnergy: () => void;
}) {
  const all = groups.flatMap(g => g.equipment);
  const active = all.filter(e => STATUS_ACTIVE.has(e.status)).length;
  const auto = all.filter(e => e.auto).length;
  const totalKwh = parseFloat(
    all.reduce((s, eq) => s + mockKwh(eq.id), 0).toFixed(1)
  );

  return (
    <div className="ctrl-summary">
      <div className="ctrl-summary__stats">
        <div className="ctrl-summary__stat">
          <span className="ctrl-summary__num">
            {active}<span className="ctrl-summary__denom">/{all.length}</span>
          </span>
          <span className="ctrl-summary__lbl">가동 중</span>
        </div>
        <div className="ctrl-summary__sep" />
        <div className="ctrl-summary__stat">
          <span className="ctrl-summary__num">
            {auto}<span className="ctrl-summary__denom">/{all.length}</span>
          </span>
          <span className="ctrl-summary__lbl">자동 모드</span>
        </div>
        <div className="ctrl-summary__sep" />
        <div className="ctrl-summary__stat">
          <span className="ctrl-summary__num">{totalKwh}</span>
          <span className="ctrl-summary__lbl">오늘 kWh</span>
        </div>
        <div className="ctrl-summary__sep" />
        <div className="ctrl-summary__stat">
          <span className="ctrl-summary__num">{groups.length}</span>
          <span className="ctrl-summary__lbl">장비 그룹</span>
        </div>
      </div>

      <div className="ctrl-summary__right">
        <button
          className={`ctrl-energy-btn${showEnergy ? ' ctrl-energy-btn--active' : ''}`}
          onClick={onToggleEnergy}
        >
          <Zap size={12} />
          에너지
        </button>
        <div className="ctrl-summary__filters">
          <button
            className={`ctrl-filter${filter === 'all' ? ' ctrl-filter--active' : ''}`}
            onClick={() => onFilter('all')}
          >전체</button>
          {groups.map(g => {
            const meta = GROUP_META[g.type];
            const isActive = filter === g.type;
            return (
              <button
                key={g.type}
                className={`ctrl-filter${isActive ? ' ctrl-filter--active' : ''}`}
                style={isActive && meta ? { borderColor: meta.color, color: meta.color, background: `${meta.color}12` } : undefined}
                onClick={() => onFilter(g.type)}
              >
                {meta && <meta.Icon size={12} />}
                {g.displayName}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function ControlPage() {
  const { equipmentGroups } = useFarm();

  const [filter, setFilter] = useState('all');
  const [historyEq, setHistoryEq] = useState<Equipment | null>(null);
  const [schedOpenId, setSchedOpenId] = useState<number | null>(null);
  const [schedOverrides, setSchedOverrides] = useState<Record<number, number[]>>({});
  const [showEnergy, setShowEnergy] = useState(false);
  const [heatPumpTodayKwh, setHeatPumpTodayKwh] = useState<number | null>(null);

  useEffect(() => {
    const fetchTodayKwh = async () => {
      try {
        const today = new Date();
        const startDate = today.toLocaleDateString('sv'); // YYYY-MM-DD
        const res = await environmentApi.getHistory({ sensorType: 'heatPumpPower', startDate, endDate: startDate });
        const points = res.data;
        if (points.length < 2) return;
        let wattSeconds = 0;
        for (let i = 1; i < points.length; i++) {
          const dt = points[i].timestamp - points[i - 1].timestamp;
          const avgW = (points[i].value + points[i - 1].value) / 2;
          wattSeconds += avgW * dt;
        }
        setHeatPumpTodayKwh(parseFloat((wattSeconds / 3_600_000).toFixed(2)));
      } catch { /* 오류 시 null 유지 */ }
    };
    fetchTodayKwh();
    const id = setInterval(fetchTodayKwh, 60_000);
    return () => clearInterval(id);
  }, []);

  const toggleScheduler = useCallback((id: number) => {
    setSchedOpenId(prev => (prev === id ? null : id));
  }, []);

  const toggleScheduleHour = useCallback((eqId: number, groupType: string, h: number) => {
    setSchedOverrides(prev => {
      const current = prev[eqId] ?? defaultSchedule(groupType);
      const s = new Set(current);
      s.has(h) ? s.delete(h) : s.add(h);
      return { ...prev, [eqId]: Array.from(s).sort((a, b) => a - b) };
    });
  }, []);

  const allEquipment = equipmentGroups.flatMap(g => g.equipment);
  const active = allEquipment.filter(e => STATUS_ACTIVE.has(e.status)).length;
  const critical = allEquipment.filter(e =>
    e.envValue != null && e.target != null &&
    Math.abs(e.envValue - e.target) > e.target * 0.2
  ).length;
  const totalErrors = allEquipment.reduce((s, e) => s + mockErrors(e.id), 0);

  const visibleGroups = filter === 'all'
    ? equipmentGroups
    : equipmentGroups.filter(g => g.type === filter);

  return (
    <div className="ctrl">

      {/* Header */}
      <div className="ctrl__header">
        <div className="ctrl__header-badges">
          <span className="ctrl__badge ctrl__badge--on">{active} 가동중</span>
          {critical > 0 && (
            <span className="ctrl__badge ctrl__badge--warn">{critical} 편차 주의</span>
          )}
          {totalErrors > 0 && (
            <span className="ctrl__badge ctrl__badge--err">{totalErrors} 오류 이력</span>
          )}
        </div>
      </div>

      {/* Summary */}
      <SummaryBar
        groups={equipmentGroups}
        filter={filter}
        onFilter={setFilter}
        showEnergy={showEnergy}
        onToggleEnergy={() => setShowEnergy(v => !v)}
      />

      {/* Energy panel */}
      {showEnergy && <EnergyPanel groups={equipmentGroups} />}

      {/* Body */}
      <div className={`ctrl__body${historyEq ? ' ctrl__body--panel' : ''}`}>
        <div className="ctrl__groups">
          {visibleGroups.map(g => (
            <GroupCard
              key={g.type}
              group={g}
              scheduleOpenId={schedOpenId}
              onToggleScheduler={toggleScheduler}
              scheduleOverrides={schedOverrides}
              onToggleSchedule={toggleScheduleHour}
              onOpenHistory={setHistoryEq}
              heatPumpTodayKwh={heatPumpTodayKwh}
            />
          ))}
        </div>

        {/* Side panel */}
        {historyEq && (
          <HistoryPanel
            eq={historyEq}
            onClose={() => setHistoryEq(null)}
          />
        )}
      </div>

    </div>
  );
}
