// Lite mode — portrait, data-only, no 3D
// 접두사: farmlite__

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFarm } from '../contexts/FarmContext';
import { useWeather } from '../hooks/useWeather';
import type { EnvironmentData } from '../types/farm';
import { equipmentApi } from '../api/equipment';
import ActivityTimeline from './ActivityTimeline';
import Chatbot from './Chatbot';
import './FarmModelLite.css';

// ── Constants ─────────────────────────────────────────────
const LED_DEFS = [
  { id: 1, label: 'LED 1' },
  { id: 2, label: 'LED 2' },
  { id: 3, label: 'LED 3' },
] as const;

const EQUIP_DEFS = [
  { ids: [8]    as const, label: '팬코일',  group: 'climate' },
  { ids: [9]    as const, label: '히트펌프', group: 'climate' },
  { ids: [11]   as const, label: '믹서',    group: 'nutrition' },
  { ids: [6, 7] as const, label: '양액펌프', group: 'nutrition' },
];

const SENSORS = [
  { key: 'temperature', label: 'TEMPERATURE', unit: '°C',   color: '#dc2626', fmt: (v: number) => v.toFixed(1) },
  { key: 'humidity',    label: 'HUMIDITY',    unit: '%',    color: '#2563eb', fmt: (v: number) => v.toFixed(1) },
  { key: 'co2',         label: 'CO₂',         unit: 'ppm',  color: '#7c3aed', fmt: (v: number) => v.toFixed(0) },
  { key: 'light',       label: 'LIGHT',       unit: '%',    color: '#d97706', fmt: (v: number) => v.toFixed(0) },
  { key: 'ph',          label: 'pH',          unit: '',     color: '#059669', fmt: (v: number) => v.toFixed(1) },
  { key: 'ec',          label: 'EC',          unit: 'dS/m', color: '#0891b2', fmt: (v: number) => v.toFixed(1) },
  { key: 'waterTemp',   label: 'WATER TEMP',  unit: '°C',   color: '#0284c7', fmt: (v: number) => v.toFixed(1) },
  { key: 'oxygenLevel', label: 'DO',          unit: 'mg/L', color: '#16a34a', fmt: (v: number) => v.toFixed(1) },
] as const;

const FUNNEL_BASE = 'https://k8s-worker02.tail63c20e.ts.net';
const CAMERAS = [{ id: 'cam2', label: 'CAM 1' }, { id: 'cam1', label: 'CAM 2' }];

const MOCK_PLANT = {
  analyzedAt: '2026-05-11 06:00',
  summary: '파이프 내 식물 없음 — 정식 준비 단계',
  status: 'empty' as 'healthy' | 'warning' | 'empty',
  details: [
    { label: '정식 여부', value: '미정식 — Net pot 슬롯 비어있음' },
    { label: '육묘 상태', value: '하단 플러그 트레이 발아 진행 중' },
    { label: '배관 상태', value: '정상 — 양액 공급 이상 없음' },
    { label: '센서 모듈', value: '각 열 부착 센서 정상 감지' },
    { label: '정식 예상', value: '약 7~10일 내 가능' },
  ],
  recommendation: '현재 파이프에 식물이 없습니다. 육묘 트레이 발아 후 정식 일정을 수립하세요.',
};

// ── Drag-to-close ─────────────────────────────────────────
function useDragToClose(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY   = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const dy = Math.max(0, e.touches[0].clientY - startY.current);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - startY.current;
    const sheet = sheetRef.current;
    if (!sheet) return;

    if (dy > 80) {
      // 충분히 내렸으면 닫기
      sheet.style.transition = 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)';
      sheet.style.transform = 'translateY(100%)';
      setTimeout(onClose, 220);
    } else if (Math.abs(dy) < 8) {
      // 거의 움직임 없음 = 탭
      onClose();
    } else {
      // 임계치 미만 → 스냅백
      sheet.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
      sheet.style.transform = 'translateY(0)';
    }
  };

  return { sheetRef, handleProps: { onTouchStart, onTouchMove, onTouchEnd } };
}

function SheetHandleArea(props: {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}) {
  return (
    <div className="farmlite__sheet-handle-area" {...props}>
      <div className="farmlite__sheet-handle" />
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return <button className={`farmlite__toggle${on ? ' farmlite__toggle--on' : ''}`} onClick={onChange} />;
}

// ── Bottom nav ────────────────────────────────────────────
type NavId = 'status' | 'monitor' | 'log' | 'ai' | 'market';
const NAV_ITEMS: { id: NavId; label: string }[] = [
  { id: 'status',  label: '현황' },
  { id: 'monitor', label: '모니터' },
  { id: 'log',     label: '로그' },
  { id: 'ai',      label: 'AI' },
  { id: 'market',  label: '마켓' },
];

function LiteBottomNav({ active, onSelect }: { active: NavId; onSelect: (id: NavId) => void }) {
  return (
    <div className="farmlite__bottomnav">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          className={`farmlite__nav-item${item.id === active ? ' farmlite__nav-item--active' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          <span className="farmlite__nav-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Settings overlay ──────────────────────────────────────
type AppMode = 'high' | 'lite';

function LiteSettingsOverlay({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<AppMode>(
    () => (localStorage.getItem('coglabs-mode') as AppMode) ?? 'lite'
  );
  const { sheetRef, handleProps } = useDragToClose(onClose);

  const handleSelect = (m: AppMode) => {
    setMode(m);
    localStorage.setItem('coglabs-mode', m);
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: 'modeChange', mode: m }));
    onClose();
  };

  return (
    <>
      <div className="farmlite__overlay-backdrop" onClick={onClose} />
      <div className="farmlite__settings-sheet" ref={sheetRef}>
        <SheetHandleArea {...handleProps} />
        <div className="farmlite__settings-header">
          <span className="farmlite__settings-title">설정</span>
          <button className="farmlite__sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="farmlite__settings-section-label">Performance Mode</div>
        <div className="farmlite__mode-selector">
          <button
            className={`farmlite__mode-btn${mode === 'high' ? ' farmlite__mode-btn--active' : ''}`}
            onClick={() => handleSelect('high')}
          >
            {mode === 'high' && <span className="farmlite__mode-dot" />}
            <span className="farmlite__mode-title">High Spec</span>
            <span className="farmlite__mode-desc">3D 대시보드 · 가로화면</span>
          </button>
          <button
            className={`farmlite__mode-btn${mode === 'lite' ? ' farmlite__mode-btn--active' : ''}`}
            onClick={() => handleSelect('lite')}
          >
            {mode === 'lite' && <span className="farmlite__mode-dot" />}
            <span className="farmlite__mode-title">Lite</span>
            <span className="farmlite__mode-desc">데이터 전용 · 세로화면</span>
          </button>
        </div>
      </div>
    </>
  );
}

// ── AI chat overlay ───────────────────────────────────────
function LiteAiPanel({ onClose }: { onClose: () => void }) {
  const { sheetRef, handleProps } = useDragToClose(onClose);
  return (
    <>
      <div className="farmlite__overlay-backdrop" onClick={onClose} />
      <div className="farmlite__ai-sheet" ref={sheetRef}>
        <SheetHandleArea {...handleProps} />
        <Chatbot embedded noAutoFocus />
      </div>
    </>
  );
}

// ── Market overlay ────────────────────────────────────────
const MARKET_ACTIONS = [
  { label: '퀵 등록', desc: '수확물을 빠르게 마켓에 등록합니다' },
  { label: '내 물품 조회', desc: '등록한 물품 현황을 확인합니다' },
  { label: '거래 내역', desc: '최근 거래 내역을 확인합니다' },
];

function LiteMarketPanel({ onClose }: { onClose: () => void }) {
  const { sheetRef, handleProps } = useDragToClose(onClose);
  return (
    <>
      <div className="farmlite__overlay-backdrop" onClick={onClose} />
      <div className="farmlite__mkt-sheet" ref={sheetRef}>
        <SheetHandleArea {...handleProps} />
        <div className="farmlite__mkt-header">
          <span className="farmlite__mkt-title">마켓</span>
          <button className="farmlite__sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="farmlite__mkt-body">
          {MARKET_ACTIONS.map(a => (
            <div key={a.label} className="farmlite__mkt-action">
              <div className="farmlite__mkt-action-info">
                <span className="farmlite__mkt-action-label">{a.label}</span>
                <span className="farmlite__mkt-action-desc">{a.desc}</span>
              </div>
              <span className="farmlite__mkt-soon">준비 중</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Plant panel ───────────────────────────────────────────
function LitePlantPanel() {
  const { status, summary, analyzedAt, details, recommendation } = MOCK_PLANT;
  const statusColor = status === 'healthy' ? '#059669' : status === 'warning' ? '#d97706' : '#94a3b8';
  const statusLabel = status === 'healthy' ? '정상' : status === 'warning' ? '주의' : '비어있음';
  return (
    <div className="farmlite__plant">
      <div className="farmlite__plant-meta">
        <span className="farmlite__plant-status" style={{ color: statusColor }}>
          <span className="farmlite__plant-dot" style={{ background: statusColor }} />
          {statusLabel}
        </span>
        <span className="farmlite__plant-time">{analyzedAt}</span>
      </div>
      <p className="farmlite__plant-summary">{summary}</p>
      <div className="farmlite__plant-details">
        {details.map((d, i) => (
          <div key={i} className="farmlite__plant-row">
            <span className="farmlite__plant-row-label">{d.label}</span>
            <span className="farmlite__plant-row-val">{d.value}</span>
          </div>
        ))}
      </div>
      <p className="farmlite__plant-rec">{recommendation}</p>
    </div>
  );
}

// ── CCTV panel ────────────────────────────────────────────
function LiteCctvPanel() {
  return (
    <div className="farmlite__cctv">
      {CAMERAS.map(cam => (
        <div key={cam.id} className="farmlite__cctv-feed">
          <div className="farmlite__cctv-header">
            <span className="farmlite__cctv-live" />
            <span className="farmlite__cctv-label">{cam.label}</span>
          </div>
          <iframe src={`${FUNNEL_BASE}/${cam.id}`} className="farmlite__cctv-frame" allow="autoplay" />
        </div>
      ))}
    </div>
  );
}

// ── Status screen ─────────────────────────────────────────
interface StatusScreenProps {
  sensorData: EnvironmentData;
  getLedOn: (id: number) => boolean;
  toggleLed: (id: number) => void;
  getEquipOn: (ids: readonly number[]) => boolean;
  toggleEquip: (ids: readonly number[]) => void;
}

function StatusScreen({ sensorData, getLedOn, toggleLed, getEquipOn, toggleEquip }: StatusScreenProps) {
  return (
    <div className="farmlite__scroll">
      <div className="farmlite__card">
        <div className="farmlite__card-label">실시간 환경</div>
        <div className="farmlite__sensor-grid">
          {SENSORS.map(s => {
            const raw = sensorData[s.key as keyof EnvironmentData] as number;
            return (
              <div key={s.key} className="farmlite__sensor-cell">
                <span className="farmlite__sensor-label">{s.label}</span>
                <span className="farmlite__sensor-val" style={{ color: s.color }}>
                  {s.fmt(raw)}<span className="farmlite__sensor-unit">{s.unit}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="farmlite__card">
        <div className="farmlite__card-label">장비 제어</div>

        <div className="farmlite__equip-group-label">조명</div>
        {LED_DEFS.map(led => (
          <div key={led.id} className="farmlite__equip-row">
            <span className="farmlite__equip-name">{led.label}</span>
            <div className="farmlite__equip-row-right">
              <span className={`farmlite__equip-status${getLedOn(led.id) ? ' farmlite__equip-status--on' : ''}`}>
                {getLedOn(led.id) ? 'ON' : 'OFF'}
              </span>
              <Toggle on={getLedOn(led.id)} onChange={() => toggleLed(led.id)} />
            </div>
          </div>
        ))}

        <div className="farmlite__equip-group-label">환경 제어</div>
        {EQUIP_DEFS.filter(d => d.group === 'climate').map(d => (
          <div key={d.label} className="farmlite__equip-row">
            <span className="farmlite__equip-name">{d.label}</span>
            <div className="farmlite__equip-row-right">
              <span className={`farmlite__equip-status${getEquipOn(d.ids) ? ' farmlite__equip-status--on' : ''}`}>
                {getEquipOn(d.ids) ? 'ON' : 'OFF'}
              </span>
              <Toggle on={getEquipOn(d.ids)} onChange={() => toggleEquip(d.ids)} />
            </div>
          </div>
        ))}

        <div className="farmlite__equip-group-label">양액 관리</div>
        {EQUIP_DEFS.filter(d => d.group === 'nutrition').map(d => (
          <div key={d.label} className="farmlite__equip-row">
            <span className="farmlite__equip-name">{d.label}</span>
            <div className="farmlite__equip-row-right">
              <span className={`farmlite__equip-status${getEquipOn(d.ids) ? ' farmlite__equip-status--on' : ''}`}>
                {getEquipOn(d.ids) ? 'ON' : 'OFF'}
              </span>
              <Toggle on={getEquipOn(d.ids)} onChange={() => toggleEquip(d.ids)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Monitor screen ────────────────────────────────────────
function MonitorScreen() {
  const [activeTab, setActiveTab] = useState<'cctv' | 'plant'>('cctv');
  return (
    <div className="farmlite__screen">
      <div className="farmlite__inner-tabbar">
        {(['cctv', 'plant'] as const).map(tab => (
          <button
            key={tab}
            className={`farmlite__inner-tab${activeTab === tab ? ' farmlite__inner-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'cctv' ? 'CCTV' : '식물 상태'}
          </button>
        ))}
      </div>
      <div className="farmlite__scroll">
        {activeTab === 'cctv'  && <LiteCctvPanel />}
        {activeTab === 'plant' && <LitePlantPanel />}
      </div>
    </div>
  );
}

// ── Log screen ────────────────────────────────────────────
function LogScreen() {
  return (
    <div className="farmlite__screen farmlite__log-screen">
      <ActivityTimeline />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────
const DEFAULT_SENSOR: EnvironmentData = {
  temperature: 0, humidity: 0, co2: 0, light: 0, ph: 0, ec: 0, waterTemp: 0, oxygenLevel: 0,
};

export interface FarmModelLiteProps {
  led1On?: boolean; led2On?: boolean; led3On?: boolean;
  sensorData?: EnvironmentData;
}

export default function FarmModelLite({
  led1On = false, led2On = false, led3On = false, sensorData = DEFAULT_SENSOR,
}: FarmModelLiteProps) {
  const { toggleEquipmentStatus, equipmentGroups } = useFarm();
  const weather = useWeather();
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [selectedFarm, setSelectedFarm] = useState<'farm1' | 'farm2'>('farm1');
  const [localLed1, setLocalLed1] = useState(led1On);
  const [localLed2, setLocalLed2] = useState(led2On);
  const [localLed3, setLocalLed3] = useState(led3On);
  const [activeScreen, setActiveScreen] = useState<'status' | 'monitor' | 'log'>('status');
  const [showSettings, setShowSettings] = useState(false);
  const [showAi, setShowAi]     = useState(false);
  const [showMarket, setShowMarket] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ready' }));
  }, []);

  const allEquip = useMemo(() => equipmentGroups.flatMap(g => g.equipment), [equipmentGroups]);

  const getLedOn = (id: number) => id === 1 ? localLed1 : id === 2 ? localLed2 : localLed3;

  const toggleLed = (id: number) => {
    const next = !getLedOn(id);
    (id === 1 ? setLocalLed1 : id === 2 ? setLocalLed2 : setLocalLed3)(next);
    toggleEquipmentStatus(id, next ? 'ON' : 'OFF');
    equipmentApi.control(id, next ? 'ON' : 'OFF').catch(console.error);
  };

  const getEquipOn = (ids: readonly number[]) =>
    ids.some(id => allEquip.find(e => e.id === id)?.status !== 'OFF');

  const toggleEquip = (ids: readonly number[]) => {
    const next = !getEquipOn(ids);
    ids.forEach(id => {
      toggleEquipmentStatus(id, next ? 'ON' : 'OFF');
      equipmentApi.control(id, next ? 'ON' : 'OFF').catch(console.error);
    });
  };

  const handleNav = (id: NavId) => {
    if (id === 'ai')     { setShowAi(true);     return; }
    if (id === 'market') { setShowMarket(true);  return; }
    setActiveScreen(id as 'status' | 'monitor' | 'log');
  };

  const navActive: NavId = showAi ? 'ai' : showMarket ? 'market' : activeScreen;
  const timeStr = currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="farmlite__root">

      {/* ── Top bar ── */}
      <div className="farmlite__topbar">
        <div className="farmlite__farm-selector">
          <button
            className={`farmlite__farm-tab${selectedFarm === 'farm1' ? ' farmlite__farm-tab--active' : ''}`}
            onClick={() => setSelectedFarm('farm1')}
          >Farm 1</button>
          <button
            className={`farmlite__farm-tab${selectedFarm === 'farm2' ? ' farmlite__farm-tab--active' : ''}`}
            onClick={() => setSelectedFarm('farm2')}
          >Farm 2</button>
        </div>
        <div className="farmlite__topbar-right">
          {!weather.loading && (
            <span className="farmlite__topbar-weather">{weather.temperature.toFixed(1)}°C</span>
          )}
          <span className="farmlite__topbar-time">{timeStr}</span>
          <button className="farmlite__topbar-settings" onClick={() => setShowSettings(true)}>
            설정
          </button>
        </div>
      </div>

      {/* ── Screens ── */}
      {selectedFarm === 'farm2' ? (
        <div className="farmlite__screen farmlite__screen--center">
          <div className="farmlite__coming-soon-title">준비 중</div>
          <div className="farmlite__coming-soon-sub">Farm 2는 곧 만나보실 수 있습니다</div>
        </div>
      ) : (
        <>
          {activeScreen === 'status'  && (
            <StatusScreen
              sensorData={sensorData}
              getLedOn={getLedOn}
              toggleLed={toggleLed}
              getEquipOn={getEquipOn}
              toggleEquip={toggleEquip}
            />
          )}
          {activeScreen === 'monitor' && <MonitorScreen />}
          {activeScreen === 'log'     && <LogScreen />}
        </>
      )}

      <LiteBottomNav active={navActive} onSelect={handleNav} />

      {showSettings && <LiteSettingsOverlay onClose={() => setShowSettings(false)} />}
      {showAi       && <LiteAiPanel         onClose={() => setShowAi(false)} />}
      {showMarket   && <LiteMarketPanel     onClose={() => setShowMarket(false)} />}
    </div>
  );
}
