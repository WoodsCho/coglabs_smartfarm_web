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
import { controllerApi, REAL_DEVICE_MAP } from '../api/equipment';
import type { AutoRule, Equipment, EquipmentGroup } from '../types/farm';
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
function mockErrors(_id: number): number {
  return 0;
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

const LED_LUX_KEY: Record<number, 'light1' | 'light2' | 'light3'> = { 1: 'light1', 2: 'light2', 3: 'light3' };
const LED_SENSOR_LABEL: Record<number, string> = { 1: '조도센서1 (3층)', 2: '조도센서2 (2층)', 3: '조도센서3 (1층)' };

const ALL_SENSOR_OPTIONS = [
  { value: 'light1',      label: '조도 1 (3층)',  unit: 'lux'  },
  { value: 'light2',      label: '조도 2 (2층)',  unit: 'lux'  },
  { value: 'light3',      label: '조도 3 (1층)',  unit: 'lux'  },
  { value: 'temperature', label: '온도',          unit: '°C'   },
  { value: 'humidity',    label: '습도',          unit: '%'    },
  { value: 'co2',         label: 'CO2',           unit: 'ppm'  },
  { value: 'waterTemp',   label: '수온',          unit: '°C'   },
  { value: 'ph',          label: 'pH',            unit: ''     },
  { value: 'ec',          label: 'EC',            unit: 'dS/m' },
  { value: 'oxygenLevel', label: '용존산소',      unit: 'mV'   },
];

const GROUP_SENSOR_KEYS: Record<string, string[]> = {
  heater: ['temperature', 'humidity'],
  fan:    ['temperature', 'humidity', 'co2'],
  pump:   ['waterTemp', 'ph', 'ec', 'oxygenLevel'],
  co2:    ['co2', 'temperature'],
};

function getSensorOptions(groupType: string) {
  const keys = GROUP_SENSOR_KEYS[groupType];
  if (!keys) return ALL_SENSOR_OPTIONS;
  return ALL_SENSOR_OPTIONS.filter(o => keys.includes(o.value));
}

/* ── Auto Rule Modal ─────────────────────────────────────────── */
function AutoRuleModal({
  eq,
  realDeviceId,
  defaultSensorType,
  groupType,
  onClose,
}: {
  eq: Equipment;
  realDeviceId: string;
  defaultSensorType: string;
  groupType: string;
  onClose: () => void;
}) {
  const { setDeviceMode, deviceModes } = useFarm();
  const sensorOptions = getSensorOptions(groupType);
  // LED는 장비마다 대응 센서가 하나로 고정 (defaultSensorType = luxKey)
  const fixedSensor = groupType === 'led'
    ? (ALL_SENSOR_OPTIONS.find(o => o.value === defaultSensorType) ?? null)
    : sensorOptions.length === 1 ? sensorOptions[0] : null;
  const [rules, setRules] = useState<AutoRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [ruleTypeTab, setRuleTypeTab] = useState<'threshold' | 'schedule'>('threshold');
  const [sensorType, setSensorType] = useState(fixedSensor?.value ?? defaultSensorType);
  const [thresholdOn, setThresholdOn] = useState('');
  const [thresholdOff, setThresholdOff] = useState('');
  const [durH, setDurH] = useState('');
  const [durM, setDurM] = useState('');
  const [durS, setDurS] = useState('');
  const [startHour, setStartHour] = useState('6');
  const [endHour, setEndHour] = useState('18');
  const [scheduleAction, setScheduleAction] = useState<'ON' | 'OFF'>('ON');
  const [cooldown, setCooldown] = useState('60');
  const [addError, setAddError] = useState('');

  const modeConfig = deviceModes[realDeviceId];
  const isCurrentlyAuto = modeConfig?.mode === 'auto';

  useEffect(() => {
    setLoading(true);
    controllerApi.getRules(realDeviceId)
      .then(setRules)
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, [realDeviceId]);

  const currentSensorOption = sensorOptions.find(o => o.value === sensorType);

  const handleAddRule = async (): Promise<boolean> => {
    if (ruleTypeTab === 'threshold') {
      if (!thresholdOn && !thresholdOff) {
        setAddError('ON 또는 OFF 임계값 중 하나는 입력해야 합니다.');
        return false;
      }
    } else {
      if (!startHour || !endHour) {
        setAddError('시작·종료 시간을 모두 입력해야 합니다.');
        return false;
      }
      if (Number(startHour) >= Number(endHour)) {
        setAddError('시작 시간은 종료 시간보다 앞서야 합니다.');
        return false;
      }
    }
    setAddError('');
    try {
      const common = { equipment_id: realDeviceId, cooldown_sec: Number(cooldown) || 60, enabled: true as const };
      const newRule = ruleTypeTab === 'threshold'
        ? await controllerApi.createRule({
            ...common, rule_type: 'threshold' as const, sensor_type: sensorType,
            ...(thresholdOn  ? { threshold_on:  Number(thresholdOn)  } : {}),
            ...(thresholdOff ? { threshold_off: Number(thresholdOff) } : {}),
            ...(() => { const d = (Number(durH)||0)*3600 + (Number(durM)||0)*60 + (Number(durS)||0); return d > 0 ? { duration_sec: d } : {}; })(),
          })
        : await controllerApi.createRule({
            ...common, rule_type: 'schedule' as const, sensor_type: '',
            start_hour: Number(startHour), end_hour: Number(endHour), schedule_action: scheduleAction,
          });
      setRules(prev => [...prev, newRule]);
      setThresholdOn(''); setThresholdOff(''); setDurH(''); setDurM(''); setDurS('');
      return true;
    } catch {
      setAddError('규칙 저장에 실패했습니다.');
      return false;
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    try {
      await controllerApi.deleteRule(realDeviceId, ruleId);
      setRules(prev => prev.filter(r => r.rule_id !== ruleId));
    } catch { /* ignore */ }
  };

  const handleToggleMode = async () => {
    setActivating(true);
    try {
      if (!isCurrentlyAuto) {
        const hasPendingThreshold = ruleTypeTab === 'threshold' && (thresholdOn || thresholdOff);
        const hasPendingSchedule = ruleTypeTab === 'schedule' && startHour && endHour;
        if (hasPendingThreshold || hasPendingSchedule) {
          const saved = await handleAddRule();
          if (!saved) {
            setActivating(false);
            return;
          }
        } else if (rules.length === 0) {
          setAddError('규칙을 하나 이상 입력한 뒤 활성화하세요.');
          setActivating(false);
          return;
        }
      }
      await setDeviceMode(realDeviceId, isCurrentlyAuto ? 'manual' : 'auto');
      onClose();
    } catch {
      setActivating(false);
    }
  };

  return (
    <div className="auto-modal-overlay" onClick={onClose}>
      <div className="auto-modal" onClick={e => e.stopPropagation()}>
        <div className="auto-modal__head">
          <div className="auto-modal__head-left">
            <span className="auto-modal__title">자동 제어 설정</span>
            <span className="auto-modal__device">{eq.name}</span>
          </div>
          <button className="auto-modal__close" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="auto-modal__body">
          {isCurrentlyAuto && modeConfig && (
            <div className="auto-modal__status">
              <span className="auto-modal__status-badge">자동 모드 활성</span>
              {modeConfig.last_auto_triggered > 0 && (
                <span className="auto-modal__last-triggered">
                  <Clock size={10} />
                  마지막 제어: {new Date(modeConfig.last_auto_triggered * 1000).toLocaleString('ko-KR', {
                    month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
                  })}
                  {modeConfig.last_auto_action && ` (${modeConfig.last_auto_action})`}
                </span>
              )}
            </div>
          )}

          <div className="auto-modal__section">
            <span className="auto-modal__section-title">등록된 규칙</span>
            {loading ? (
              <span className="auto-modal__loading">불러오는 중...</span>
            ) : rules.length === 0 ? (
              <span className="auto-modal__empty">등록된 규칙이 없습니다.</span>
            ) : (
              <div className="auto-modal__rule-list">
                {rules.map(r => {
                  const sOpt = ALL_SENSOR_OPTIONS.find(o => o.value === r.sensor_type);
                  const isSched = r.rule_type === 'schedule';
                  return (
                    <div key={r.rule_id} className="auto-modal__rule">
                      <div className="auto-modal__rule-info">
                        <span className="auto-modal__rule-sensor">
                          {isSched ? '시간 스케줄' : (sOpt?.label ?? r.sensor_type)}
                        </span>
                        <div className="auto-modal__rule-conds">
                          {isSched ? (
                            <>
                              <span className="auto-modal__cond auto-modal__cond--cd">
                                {String(r.start_hour ?? 0).padStart(2, '0')}:00 ~ {String(r.end_hour ?? 0).padStart(2, '0')}:00
                              </span>
                              <span className={`auto-modal__cond ${r.schedule_action === 'ON' ? 'auto-modal__cond--on' : 'auto-modal__cond--off'}`}>
                                기간 중 {r.schedule_action}
                              </span>
                            </>
                          ) : (
                            <>
                              {r.threshold_on != null && (
                                <span className="auto-modal__cond auto-modal__cond--on">{r.threshold_on}{sOpt?.unit} 미만 → ON</span>
                              )}
                              {r.threshold_off != null && (
                                <span className="auto-modal__cond auto-modal__cond--off">{r.threshold_off}{sOpt?.unit} 초과 → OFF</span>
                              )}
                              {(r.duration_sec ?? 0) > 0 && (() => {
                                const total = r.duration_sec!;
                                const h = Math.floor(total / 3600);
                                const m = Math.floor((total % 3600) / 60);
                                const s = total % 60;
                                const parts = [h && `${h}시간`, m && `${m}분`, s && `${s}초`].filter(Boolean);
                                return <span className="auto-modal__cond auto-modal__cond--dur">{parts.join(' ')} 유지</span>;
                              })()}
                            </>
                          )}
                          <span className="auto-modal__cond auto-modal__cond--cd">쿨다운 {r.cooldown_sec}s</span>
                        </div>
                      </div>
                      <button className="auto-modal__rule-del" onClick={() => handleDeleteRule(r.rule_id)} title="규칙 삭제">
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="auto-modal__section">
            <span className="auto-modal__section-title">규칙 추가</span>

            <div className="auto-modal__tabs">
              <button
                className={`auto-modal__tab${ruleTypeTab === 'threshold' ? ' auto-modal__tab--active' : ''}`}
                onClick={() => { setRuleTypeTab('threshold'); setAddError(''); }}
              >임계값 기반</button>
              <button
                className={`auto-modal__tab${ruleTypeTab === 'schedule' ? ' auto-modal__tab--active' : ''}`}
                onClick={() => { setRuleTypeTab('schedule'); setAddError(''); }}
              >시간 스케줄</button>
            </div>

            <div className="auto-modal__form">
              {ruleTypeTab === 'threshold' ? (
                <>
                  <div className="auto-modal__form-row">
                    <label className="auto-modal__label">
                      센서
                      {fixedSensor ? (
                        <span className="auto-modal__sensor-fixed">{fixedSensor.label}</span>
                      ) : (
                        <select className="auto-modal__select" value={sensorType} onChange={e => setSensorType(e.target.value)}>
                          {sensorOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}
                    </label>
                    <label className="auto-modal__label">
                      쿨다운 (초)
                      <input className="auto-modal__input" type="number" min="10" value={cooldown} onChange={e => setCooldown(e.target.value)} />
                    </label>
                  </div>
                  <div className="auto-modal__form-row">
                    <label className="auto-modal__label">
                      ON 임계값
                      <span className="auto-modal__unit">({currentSensorOption?.unit}) 미만 → ON</span>
                      <input className="auto-modal__input" type="number" placeholder="미사용" value={thresholdOn} onChange={e => setThresholdOn(e.target.value)} />
                    </label>
                    <label className="auto-modal__label">
                      OFF 임계값
                      <span className="auto-modal__unit">({currentSensorOption?.unit}) 초과 → OFF</span>
                      <input className="auto-modal__input" type="number" placeholder="미사용" value={thresholdOff} onChange={e => setThresholdOff(e.target.value)} />
                    </label>
                  </div>
                  <label className="auto-modal__label">
                    유지 시간
                    <span className="auto-modal__unit">트리거 후 설정 시간 유지 → 자동 복귀 (모두 빈칸 = 사용 안 함)</span>
                    <div className="auto-modal__dur-row">
                      <div className="auto-modal__dur-field">
                        <input className="auto-modal__input" type="number" min="0" placeholder="0" value={durH} onChange={e => setDurH(e.target.value)} />
                        <span className="auto-modal__dur-unit">시간</span>
                      </div>
                      <div className="auto-modal__dur-field">
                        <input className="auto-modal__input" type="number" min="0" max="59" placeholder="0" value={durM} onChange={e => setDurM(e.target.value)} />
                        <span className="auto-modal__dur-unit">분</span>
                      </div>
                      <div className="auto-modal__dur-field">
                        <input className="auto-modal__input" type="number" min="0" max="59" placeholder="0" value={durS} onChange={e => setDurS(e.target.value)} />
                        <span className="auto-modal__dur-unit">초</span>
                      </div>
                    </div>
                  </label>
                </>
              ) : (
                <>
                  <div className="auto-modal__form-row">
                    <label className="auto-modal__label">
                      시작 시간
                      <span className="auto-modal__unit">0 – 23시</span>
                      <input className="auto-modal__input" type="number" min="0" max="23" value={startHour} onChange={e => setStartHour(e.target.value)} />
                    </label>
                    <label className="auto-modal__label">
                      종료 시간
                      <span className="auto-modal__unit">0 – 23시</span>
                      <input className="auto-modal__input" type="number" min="0" max="23" value={endHour} onChange={e => setEndHour(e.target.value)} />
                    </label>
                  </div>
                  <div className="auto-modal__form-row">
                    <label className="auto-modal__label">
                      기간 중 동작
                      <div className="auto-modal__action-btns">
                        <button type="button"
                          className={`auto-modal__action-btn${scheduleAction === 'ON' ? ' auto-modal__action-btn--on' : ''}`}
                          onClick={() => setScheduleAction('ON')}>ON</button>
                        <button type="button"
                          className={`auto-modal__action-btn${scheduleAction === 'OFF' ? ' auto-modal__action-btn--off' : ''}`}
                          onClick={() => setScheduleAction('OFF')}>OFF</button>
                      </div>
                    </label>
                    <label className="auto-modal__label">
                      쿨다운 (초)
                      <input className="auto-modal__input" type="number" min="10" value={cooldown} onChange={e => setCooldown(e.target.value)} />
                    </label>
                  </div>
                  <span className="auto-modal__hint">
                    예: 06:00 ~ 18:00 → ON 이면, 해당 시간대에는 켜고 그 외에는 끕니다.
                  </span>
                </>
              )}
              {addError && <span className="auto-modal__error">{addError}</span>}
            </div>
          </div>
        </div>

        <div className="auto-modal__footer">
          <button className="auto-modal__cancel" onClick={onClose}>닫기</button>
          <button
            className={isCurrentlyAuto ? 'auto-modal__deactivate' : 'auto-modal__activate'}
            onClick={handleToggleMode}
            disabled={activating}
          >
            {activating ? '처리 중...' : isCurrentlyAuto ? '수동 모드로 전환' : '자동 모드 활성화'}
          </button>
        </div>
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
  const [autoModalOpen, setAutoModalOpen] = useState(false);

  const isActive = STATUS_ACTIVE.has(eq.status);
  const isVirtual = !REAL_EQUIPMENT_IDS.has(eq.id);
  const realDeviceId = REAL_DEVICE_MAP[eq.id];
  const st = STATUS_LABEL[eq.status] ?? DEFAULT_STATUS_META;
  const hasTarget = eq.target != null && eq.unit != null;
  const errors = mockErrors(eq.id);
  const isHeatPump = eq.id === 9;
  const liveKw = isHeatPump && currentData.heatPumpPower != null
    ? parseFloat((currentData.heatPumpPower / 1000).toFixed(2))
    : mockKwh(eq.id);
  const isSchedOpen = scheduleOpenId === eq.id;
  const luxKey = groupType === 'led' ? LED_LUX_KEY[eq.id] : undefined;
  const luxValue = luxKey ? currentData[luxKey] : undefined;

  const handleToggle = async () => {
    if (controlling) return;
    setControlling(true);
    try { await toggleEquipmentStatus(eq.id, isActive ? 'OFF' : 'ON'); }
    finally { setControlling(false); }
  };

  const handleModeToggle = () => {
    if (!realDeviceId) {
      toggleEquipmentAuto(eq.id, !eq.auto);
      return;
    }
    setAutoModalOpen(true);
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

        {/* Env progress bar / 조도 */}
        {hasTarget && eq.envValue != null ? (
          <EnvProgress envValue={eq.envValue} target={eq.target!} unit={eq.unit!} />
        ) : luxValue != null ? (
          <div className="ctrl-row__lux">
            <span style={{ fontSize: '10px', color: '#9ca3af' }}>{LED_SENSOR_LABEL[eq.id] ?? '조도센서'}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#d97706' }}>{luxValue.toFixed(0)} lux</span>
          </div>
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
          onClick={handleModeToggle}
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

      {/* Auto rule modal */}
      {autoModalOpen && realDeviceId != null && (
        <AutoRuleModal
          eq={eq}
          realDeviceId={realDeviceId}
          defaultSensorType={luxKey ?? 'temperature'}
          groupType={groupType}
          onClose={() => setAutoModalOpen(false)}
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
  const { toggleEquipmentStatus, toggleEquipmentAuto, setDeviceMode } = useFarm();
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
          const deviceId = REAL_DEVICE_MAP[eq.id];
          if (deviceId) {
            await setDeviceMode(deviceId, 'auto').catch(() => {});
          } else {
            toggleEquipmentAuto(eq.id, true);
          }
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
