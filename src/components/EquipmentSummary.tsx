import { useState } from 'react';
import { useFarm } from '../contexts/FarmContext';
import type { Equipment, EquipmentGroup as EqGroup } from '../types/farm';
import './EquipmentSummary.css';

const STATUS_ACTIVE = new Set(['ON', 'ACTIVE', 'RUNNING']);

// 실제 하드웨어가 연결된 장비 ID (LED 1·2·3, 히트펌프, Mixer, 4-TH 2 채널 4개)
const REAL_EQUIPMENT_IDS = new Set([1, 2, 3, 6, 7, 9, 11, 12, 13]);

const STATUS_STYLE: Record<string, { bg: string; border: string; dot: string; label: string; labelColor: string }> = {
  ON: { bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e', label: '가동', labelColor: '#16a34a' },
  ACTIVE: { bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e', label: '가동', labelColor: '#16a34a' },
  RUNNING: { bg: '#eff6ff', border: '#bfdbfe', dot: '#3b82f6', label: '운전', labelColor: '#1d4ed8' },
  STANDBY: { bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', label: '대기', labelColor: '#b45309' },
  OFF: { bg: '#fff1f2', border: '#fecdd3', dot: '#f43f5e', label: '정지', labelColor: '#e11d48' },
};
const DEFAULT_STYLE = { bg: '#f9fafb', border: '#e5e7eb', dot: '#9ca3af', label: '-', labelColor: '#6b7280' };

const GROUP_COLORS: Record<string, string> = {
  led: '#f59e0b', fan: '#3b82f6', pump: '#10b981', heater: '#ef4444', co2: '#9ca3af',
};
const GROUP_FILTER_LABELS: Record<string, string> = {
  all: '전체', led: 'LED 조명', fan: '환기팬', pump: '양액', heater: '냉난방기', co2: 'CO2 공급',
};

function EquipmentCard({ eq }: { eq: Equipment }) {
  const { toggleEquipmentStatus, toggleEquipmentAuto, updateEquipmentTarget } = useFarm();
  const isActive = STATUS_ACTIVE.has(eq.status);
  const st = STATUS_STYLE[eq.status] ?? DEFAULT_STYLE;
  const hasVals = eq.envValue != null && eq.target != null;
  const isVirtual = !REAL_EQUIPMENT_IDS.has(eq.id);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [controlling, setControlling] = useState(false);

  const handleToggle = async () => {
    if (controlling) return;
    setControlling(true);
    try {
      await toggleEquipmentStatus(eq.id, isActive ? 'OFF' : 'ON');
    } catch {
      // 오류는 FarmContext에서 로깅
    } finally {
      setControlling(false);
    }
  };

  const commitTarget = () => {
    if (editingTarget === null) return;
    const v = parseFloat(editingTarget);
    if (!isNaN(v)) updateEquipmentTarget(eq.id, +v.toFixed(1));
    setEditingTarget(null);
  };

  const handleTargetKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitTarget();
    if (e.key === 'Escape') setEditingTarget(null);
  };

  return (
    <div className={`eq-card${isVirtual ? ' eq-card--virtual' : ''}`} style={{ background: st.bg, borderColor: st.border }}>
      {/* 헤더: 이름 + 가동상태 + 자동/수동 */}
      <div className="eq-card__head">
        <span className="eq-card__name">
          {eq.name}
          {isVirtual && <span className="eq-card__virtual-badge">가상</span>}
        </span>
        <div className="eq-card__badges">
          <span className="eq-card__status" style={{ color: st.labelColor }}>
            <span className="eq-card__dot" style={{ background: st.dot }} />
            {st.label}
          </span>
          <span className={`eq-card__mode-badge ${eq.auto ? 'eq-card__mode-badge--auto' : 'eq-card__mode-badge--manual'}`}>
            {eq.auto ? '자동' : '수동'}
          </span>
        </div>
      </div>

      {/* 현재 → 목표 (없으면 빈 줄로 높이 맞춤) */}
      {hasVals ? (
        <div className="eq-card__vals">
          <div className="eq-card__val-block">
            <span className="eq-card__val-label">현재</span>
            <span className="eq-card__val" style={{ color: st.labelColor }}>{eq.envValue}{eq.unit}</span>
          </div>
          <span className="eq-card__arrow">→</span>
          <div className="eq-card__val-block">
            <span className="eq-card__val-label">목표</span>
            <span className="eq-card__val">{eq.target}{eq.unit}</span>
          </div>
        </div>
      ) : (
        <div className="eq-card__vals eq-card__vals--spacer" />
      )}

      {/* 목표값 스텝퍼 — 자동 여부와 무관하게 항상 표시 */}
      <div className="eq-card__auto-row">
        {eq.target != null ? (
          <div className="eq-card__stepper">
            <button onClick={() => updateEquipmentTarget(eq.id, +(eq.target! - 0.5).toFixed(1))}>−</button>
            {editingTarget !== null ? (
              <input
                className="eq-card__stepper-input"
                type="number"
                value={editingTarget}
                onChange={e => setEditingTarget(e.target.value)}
                onBlur={commitTarget}
                onKeyDown={handleTargetKey}
                autoFocus
              />
            ) : (
              <span
                className="eq-card__stepper-val"
                title="클릭하여 직접 입력"
                onClick={() => setEditingTarget(String(eq.target))}
              >
                {eq.target}{eq.unit}
              </span>
            )}
            <button onClick={() => updateEquipmentTarget(eq.id, +(eq.target! + 0.5).toFixed(1))}>+</button>
          </div>
        ) : (
          <span className="eq-card__auto-badge eq-card__auto-badge--manual">수동</span>
        )}
      </div>

      {/* 버튼: ON/OFF 왼쪽, 자동/수동 전환 오른쪽 */}
      <div className="eq-card__btns">
        <button
          className={`eq-card__btn ${isActive ? 'eq-card__btn--on' : 'eq-card__btn--off'}${controlling ? ' eq-card__btn--loading' : ''}`}
          onClick={handleToggle}
          disabled={controlling}
        >
          {controlling ? <span className="eq-card__btn-spinner" /> : `⏻ ${isActive ? 'ON' : 'OFF'}`}
        </button>
        <button
          className={`eq-card__btn ${eq.auto ? 'eq-card__btn--auto' : 'eq-card__btn--manual'}`}
          onClick={() => toggleEquipmentAuto(eq.id, !eq.auto)}
        >
          {eq.auto ? '자동' : '수동'}
        </button>
      </div>
    </div>
  );
}

function GroupSection({ group }: { group: EqGroup }) {
  return (
    <div className="eq-group">
      <div className="eq-group__header">
        <span className="eq-group__dot" style={{ color: GROUP_COLORS[group.type] ?? '#9ca3af' }}>●</span>
        <span className="eq-group__name">{group.displayName}</span>
      </div>
      <div className="eq-group__cards">
        {group.equipment.map(eq => <EquipmentCard key={eq.id} eq={eq} />)}
      </div>
    </div>
  );
}

export default function EquipmentSummary() {
  const { equipmentGroups } = useFarm();
  const [filter, setFilter] = useState('all');

  const activeCount = equipmentGroups.flatMap(g => g.equipment).filter(eq => STATUS_ACTIVE.has(eq.status)).length;
  const totalCount = equipmentGroups.flatMap(g => g.equipment).length;

  const visibleGroups = filter === 'all' ? equipmentGroups : equipmentGroups.filter(g => g.type === filter);

  return (
    <div className="eq-summary">
      <div className="eq-summary__header">
        <div className="eq-summary__title-row">
          <h3 className="eq-summary__title">장비 제어</h3>
          <span className="eq-summary__count">{activeCount}/{totalCount} 가동중</span>
        </div>
        <div className="eq-summary__filters">
          {['all', ...equipmentGroups.map(g => g.type)].map(f => (
            <button
              key={f}
              className={`eq-filter-btn ${filter === f ? 'eq-filter-btn--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {GROUP_FILTER_LABELS[f] ?? f}
            </button>
          ))}
        </div>
      </div>

      <div className="eq-summary__list">
        {visibleGroups.map(g => <GroupSection key={g.type} group={g} />)}
      </div>
    </div>
  );
}
