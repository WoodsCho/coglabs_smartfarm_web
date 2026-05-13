import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Cpu, User, Bell, Wrench, AlertTriangle,
  CheckCircle2, Info, XCircle, Download, Search,
  Pin, ChevronRight, ChevronDown, RefreshCw,
} from 'lucide-react';
import { useFarm } from '../contexts/FarmContext';
import './LogsPage.css';

/* ── Types ───────────────────────────────────────────────────── */
type LogCategory = '전체' | '시스템' | '사용자' | '알림' | '장비';
type LogType = 'info' | 'success' | 'warning' | 'error';
type DatePreset = 'today' | '3d' | '7d' | 'custom';

interface LogItem {
  id: number;
  datetime: string;
  date: string;
  time: string;
  hour: number;
  category: Exclude<LogCategory, '전체'>;
  type: LogType;
  title: string;
  desc?: string;
  clusterId?: string;
}

interface ClusterDef {
  id: string;
  label: string;
  memberIds: number[];
}

/* ── Mock data ───────────────────────────────────────────────── */
function makeDate(daysAgo: number, hhmm: string) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const ymd = d.toISOString().slice(0, 10);
  return { date: ymd, datetime: `${ymd} ${hhmm}`, time: hhmm, hour: parseInt(hhmm) };
}

const LOGS: LogItem[] = [
  /* 오늘 */
  { id: 1, ...makeDate(0, '09:12'), category: '장비', type: 'success', title: 'LED 1 자동 점등', desc: '조도 기준치 도달 — 자동 모드' },
  { id: 2, ...makeDate(0, '09:05'), category: '시스템', type: 'info', title: '환경 데이터 수집 완료', desc: '온도 23.5°C · 습도 68% · CO₂ 950ppm' },
  { id: 3, ...makeDate(0, '08:58'), category: '알림', type: 'warning', title: 'EC 수치 이탈 감지', desc: 'EC 2.6 dS/m (목표 2.0) — 점검 권장', clusterId: 'ec' },
  { id: 4, ...makeDate(0, '08:45'), category: '장비', type: 'info', title: '양액펌프 1 가동', desc: 'EC 이탈 대응 — 자동 순환 시작', clusterId: 'ec' },
  { id: 5, ...makeDate(0, '08:30'), category: '시스템', type: 'info', title: '시스템 일일 시작' },
  { id: 6, ...makeDate(0, '08:20'), category: '사용자', type: 'info', title: 'CO₂ 목표값 변경', desc: '900 ppm → 1,000 ppm' },
  { id: 7, ...makeDate(0, '07:55'), category: '알림', type: 'error', title: '온도 경보 발생', desc: '28.5°C — 상한 초과, 냉방 자동 가동', clusterId: 'temp' },
  { id: 8, ...makeDate(0, '07:40'), category: '장비', type: 'success', title: '쿨러 1 자동 가동', desc: '온도 경보 대응 — 자동 모드', clusterId: 'temp' },
  { id: 9, ...makeDate(0, '07:30'), category: '사용자', type: 'info', title: '목표 온도 변경', desc: '22°C → 24°C' },
  { id: 10, ...makeDate(0, '07:10'), category: '장비', type: 'info', title: '환기팬 2 대기 전환', desc: '목표 온도 달성' },
  { id: 11, ...makeDate(0, '06:50'), category: '시스템', type: 'success', title: '일일 리포트 생성 완료', desc: '전일 데이터 집계 — PDF 저장' },
  { id: 12, ...makeDate(0, '06:30'), category: '장비', type: 'info', title: 'LED 2 야간 스케줄 소등', desc: '예약 스케줄 실행' },
  { id: 13, ...makeDate(0, '06:00'), category: '알림', type: 'warning', title: 'pH 저하 감지', desc: 'pH 5.8 (목표 6.0) — 조정 권장' },
  { id: 14, ...makeDate(0, '05:45'), category: '장비', type: 'success', title: '양액 Mixer 작동 후 정지', desc: '혼합 사이클 정상 완료' },
  { id: 15, ...makeDate(0, '05:20'), category: '시스템', type: 'info', title: '새벽 자동 점검 통과' },
  { id: 16, ...makeDate(0, '00:00'), category: '시스템', type: 'info', title: '자동 백업 완료', desc: '클라우드 동기화 성공' },
  /* 어제 */
  { id: 17, ...makeDate(1, '21:15'), category: '사용자', type: 'info', title: 'EC 목표값 변경', desc: '1.8 dS/m → 2.0 dS/m' },
  { id: 18, ...makeDate(1, '18:30'), category: '장비', type: 'success', title: '청경채 수확 완료', desc: 'B-1 구획 8.7 kg — 등급 B', clusterId: 'harvest' },
  { id: 19, ...makeDate(1, '15:00'), category: '알림', type: 'warning', title: '수확 가능 알림', desc: '청경채 B-1 — 100% 진행률 달성', clusterId: 'harvest' },
  { id: 20, ...makeDate(1, '09:05'), category: '시스템', type: 'info', title: '환경 데이터 수집 완료' },
  { id: 21, ...makeDate(1, '07:12'), category: '장비', type: 'error', title: '환기팬 1 응답 없음', desc: '재시작 시도 — 2분 후 복구' },
  { id: 22, ...makeDate(1, '00:00'), category: '시스템', type: 'info', title: '자동 백업 완료' },
  /* 2일 전 */
  { id: 23, ...makeDate(2, '14:22'), category: '사용자', type: 'info', title: '바질 개화 단계 수동 전환', desc: 'A-2 구획' },
  { id: 24, ...makeDate(2, '11:10'), category: '알림', type: 'warning', title: 'CO₂ 공급 이상', desc: 'CO₂ 발생기 응답 지연 — 자동 재가동' },
  { id: 25, ...makeDate(2, '09:05'), category: '시스템', type: 'info', title: '환경 데이터 수집 완료' },
  { id: 26, ...makeDate(2, '00:00'), category: '시스템', type: 'info', title: '자동 백업 완료' },
];

const CLUSTERS: ClusterDef[] = [
  { id: 'temp', label: '온도 경보 체인', memberIds: [7, 8] },
  { id: 'ec', label: 'EC 이탈 대응', memberIds: [3, 4] },
  { id: 'harvest', label: '수확 이벤트', memberIds: [18, 19] },
];

const RT_TEMPLATES: Pick<LogItem, 'category' | 'type' | 'title' | 'desc'>[] = [
  { category: '시스템', type: 'info', title: '환경 데이터 자동 수집', desc: '실시간 업데이트 완료' },
  { category: '장비', type: 'success', title: 'LED 조명 상태 확인', desc: '정상 가동 중' },
  { category: '알림', type: 'warning', title: 'CO₂ 농도 변동 감지', desc: 'CO₂ 980 ppm (목표 1,000 ppm)' },
  { category: '시스템', type: 'info', title: '센서 데이터 동기화 완료' },
];

/* ── Constants ───────────────────────────────────────────────── */
const CATEGORIES: LogCategory[] = ['전체', '시스템', '사용자', '알림', '장비'];

const CATEGORY_META: Record<string, { Icon: LucideIcon; color: string }> = {
  시스템: { Icon: Cpu, color: '#6366F1' },
  사용자: { Icon: User, color: '#3B82F6' },
  알림: { Icon: Bell, color: '#F59E0B' },
  장비: { Icon: Wrench, color: '#10B981' },
};

const TYPE_META: Record<LogType, { Icon: LucideIcon; color: string; bg: string }> = {
  info: { Icon: Info, color: '#6B7280', bg: '#F3F4F6' },
  success: { Icon: CheckCircle2, color: '#16A34A', bg: '#DCFCE7' },
  warning: { Icon: AlertTriangle, color: '#B45309', bg: '#FEF9C3' },
  error: { Icon: XCircle, color: '#DC2626', bg: '#FEE2E2' },
};

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: '3d', label: '3일' },
  { key: '7d', label: '7일' },
  { key: 'custom', label: '사용자 지정' },
];

/* ── Helpers ─────────────────────────────────────────────────── */
function formatDateLabel(ymd: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (ymd === today) return '오늘';
  if (ymd === yesterday) return '어제';
  return ymd.replace(/-/g, '. ');
}

function getDateRange(preset: DatePreset, from: string, to: string): [string, string] {
  const today = new Date().toISOString().slice(0, 10);
  if (preset === 'today') return [today, today];
  if (preset === '3d') return [new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10), today];
  if (preset === '7d') return [new Date(Date.now() - 86400000 * 6).toISOString().slice(0, 10), today];
  return [from || today, to || today];
}

/* ── Timeline Bar ────────────────────────────────────────────── */
function TimelineBar({ todayLogs, onClickHour }: {
  todayLogs: LogItem[];
  onClickHour: (h: number) => void;
}) {
  const hourMap = useMemo(() => {
    const m: Record<number, LogType> = {};
    for (const l of todayLogs) {
      if (l.type === 'error' || l.type === 'warning') {
        if (!m[l.hour] || l.type === 'error') m[l.hour] = l.type;
      }
    }
    return m;
  }, [todayLogs]);

  return (
    <div className="logs__timeline">
      <div className="logs__tl-meta">
        <span className="logs__tl-title">오늘 심각도 타임라인</span>
        <span className="logs__tl-hint">경고/오류 시점 클릭 시 이동</span>
      </div>
      <div className="logs__tl-col">
        <div className="logs__tl-grid">
          {Array.from({ length: 24 }, (_, h) => {
            const type = hourMap[h];
            return (
              <div
                key={h}
                className={`logs__tl-cell${type ? ` logs__tl-cell--${type}` : ''}`}
                onClick={() => type && onClickHour(h)}
                title={type
                  ? `${String(h).padStart(2, '0')}:00 — ${type === 'error' ? '오류' : '경고'}`
                  : `${String(h).padStart(2, '0')}:00`}
              />
            );
          })}
        </div>
        <div className="logs__tl-labels">
          {[0, 6, 12, 18, 23].map(h => <span key={h}>{h}h</span>)}
        </div>
      </div>
    </div>
  );
}

/* ── Cluster Summary Row ─────────────────────────────────────── */
function ClusterSummaryRow({ cluster, members, isExpanded, onToggle }: {
  cluster: ClusterDef;
  members: LogItem[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const worstType: LogType = members.some(m => m.type === 'error') ? 'error'
    : members.some(m => m.type === 'warning') ? 'warning'
      : members.some(m => m.type === 'success') ? 'success'
        : 'info';
  const tm = TYPE_META[worstType];
  const TypeIcon = tm.Icon;
  const cat = members[0]?.category ?? '시스템';
  const catM = CATEGORY_META[cat];
  const times = [...members.map(m => m.time)].sort();
  const timeLabel = times.length >= 2
    ? `${times[0]}–${times[times.length - 1]}`
    : times[0] ?? '';

  return (
    <div className="log-cluster" onClick={onToggle} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onToggle()}>
      <span className="log-cluster__bar" style={{ background: tm.color }} />
      <span className="log-cluster__type-icon" style={{ color: tm.color }}>
        <TypeIcon size={13} />
      </span>
      <span className="log-cluster__time">{timeLabel}</span>
      <div className="log-cluster__cat" style={{ color: catM?.color ?? '#6B7280' }}>
        {catM && <catM.Icon size={11} />}
        <span>{cat}</span>
      </div>
      <div className="log-cluster__content">
        <span className="log-cluster__label">{cluster.label}</span>
        <span className="log-cluster__count">{members.length}건 연관</span>
      </div>
      <span className="log-cluster__badge" style={{ color: tm.color, background: tm.bg }}>CHAIN</span>
      <span className="log-cluster__chevron">
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>
    </div>
  );
}

/* ── Log Row ─────────────────────────────────────────────────── */
function LogRow({ item, pinned, onPin, isMember }: {
  item: LogItem;
  pinned: boolean;
  onPin: (id: number) => void;
  isMember: boolean;
}) {
  const tm = TYPE_META[item.type];
  const catM = CATEGORY_META[item.category];
  const TypeIcon = tm.Icon;

  return (
    <div
      id={`log-${item.id}`}
      className={`log-row${isMember ? ' log-row--member' : ''}${pinned ? ' log-row--pinned' : ''}`}
    >
      <span className="log-row__bar" style={isMember ? { background: tm.color, opacity: 0.35 } : undefined} />
      <span className="log-row__type-icon" style={{ color: tm.color }}>
        <TypeIcon size={13} />
      </span>
      <span className="log-row__time">{item.time}</span>
      <div className="log-row__cat" style={{ color: catM?.color ?? '#6B7280' }}>
        {catM && <catM.Icon size={11} />}
        <span>{item.category}</span>
      </div>
      <div className="log-row__content">
        <span className="log-row__title">{item.title}</span>
        {item.desc && <span className="log-row__desc">{item.desc}</span>}
      </div>
      <span className="log-row__badge" style={{ color: tm.color, background: tm.bg }}>
        {item.type === 'info' ? 'INFO' : item.type === 'success' ? 'OK' : item.type === 'warning' ? 'WARN' : 'ERR'}
      </span>
      <button
        className={`log-row__pin${pinned ? ' log-row__pin--active' : ''}`}
        onClick={e => { e.stopPropagation(); onPin(item.id); }}
        title={pinned ? '핀 해제' : '핀 고정'}
      >
        <Pin size={11} />
      </button>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function LogsPage() {
  const { notifications } = useFarm();
  const [category, setCategory] = useState<LogCategory>('전체');
  const [typeFilter, setTypeFilter] = useState<LogType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [pinnedIds, setPinnedIds] = useState(new Set<number>());
  const [expanded, setExpanded] = useState(new Set<string>());
  const [rtLogs, setRtLogs] = useState<LogItem[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const rtIdRef = useRef(100);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todayDate = new Date().toISOString().slice(0, 10);

  /* ── Cluster lookup ── */
  const clusterMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of CLUSTERS) for (const id of c.memberIds) m.set(id, c.id);
    return m;
  }, []);

  /* ── Real-time polling (15s) ── */
  useEffect(() => {
    const timer = setInterval(() => {
      const tpl = RT_TEMPLATES[rtIdRef.current % RT_TEMPLATES.length];
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const ymd = now.toISOString().slice(0, 10);
      setRtLogs(prev => [{ id: rtIdRef.current, date: ymd, datetime: `${ymd} ${hhmm}`, time: hhmm, hour: now.getHours(), ...tpl }, ...prev]);
      rtIdRef.current++;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToastMsg('새 이벤트 1건 추가됨');
      toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
    }, 15000);
    return () => { clearInterval(timer); if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const allLogs = useMemo(() => [...rtLogs, ...LOGS], [rtLogs]);
  const todayLogs = useMemo(() => allLogs.filter(l => l.date === todayDate), [allLogs, todayDate]);

  /* ── Date range filter ── */
  const [fromDate, toDate] = useMemo(
    () => getDateRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo]
  );

  const filtered = useMemo(() =>
    allLogs.filter(l => {
      if (l.date < fromDate || l.date > toDate) return false;
      if (category !== '전체' && l.category !== category) return false;
      if (typeFilter !== 'all' && l.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!l.title.toLowerCase().includes(q) && !l.desc?.toLowerCase().includes(q)) return false;
      }
      return true;
    }), [allLogs, fromDate, toDate, category, typeFilter, search]);

  /* ── Date grouping ── */
  const grouped = useMemo(() => {
    const map = new Map<string, LogItem[]>();
    for (const l of filtered) {
      if (!map.has(l.date)) map.set(l.date, []);
      map.get(l.date)!.push(l);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  /* ── Build display list (cluster collapsing) ── */
  type DisplayEntry =
    | { kind: 'cluster'; clusterId: string; members: LogItem[] }
    | { kind: 'log'; item: LogItem; isMember: boolean };

  const displayGroups = useMemo(() =>
    grouped.map(([date, items]) => {
      const rendered = new Set<number>();
      const list: DisplayEntry[] = [];
      for (const item of items) {
        if (rendered.has(item.id)) continue;
        const cid = clusterMap.get(item.id);
        if (cid) {
          const def = CLUSTERS.find(c => c.id === cid)!;
          const members = def.memberIds.map(id => items.find(i => i.id === id)).filter((i): i is LogItem => i != null);
          members.forEach(m => rendered.add(m.id));
          if (expanded.has(cid)) {
            members.forEach((m, idx) => list.push({ kind: 'log', item: m, isMember: idx > 0 }));
          } else {
            list.push({ kind: 'cluster', clusterId: cid, members });
          }
        } else {
          rendered.add(item.id);
          list.push({ kind: 'log', item, isMember: false });
        }
      }
      return { date, list };
    }), [grouped, clusterMap, expanded]);

  /* ── Pinned ── */
  const pinnedLogs = useMemo(() => filtered.filter(l => pinnedIds.has(l.id)), [filtered, pinnedIds]);

  /* ── Stats ── */
  const stats = useMemo(() => ({
    today: todayLogs.length,
    shown: filtered.length,
    error: filtered.filter(l => l.type === 'error').length,
    warning: filtered.filter(l => l.type === 'warning').length,
  }), [todayLogs, filtered]);

  const unread = notifications.filter(n => !n.read).length;

  /* ── Callbacks ── */
  const togglePin = useCallback((id: number) => {
    setPinnedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }, []);

  const toggleCluster = useCallback((id: string) => {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }, []);

  const scrollToHour = useCallback((hour: number) => {
    const log = todayLogs.find(l => l.hour === hour && (l.type === 'error' || l.type === 'warning'));
    if (!log) return;
    document.getElementById(`log-${log.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [todayLogs]);

  /* ── Render ── */
  return (
    <div className="logs">

      {/* Header */}
      <div className="logs__header">
        <button className="logs__export" title="CSV 내보내기">
          <Download size={14} />
          <span>내보내기</span>
        </button>
      </div>

      {/* Stats */}
      <div className="logs__stats">
        <div className="logs__stat">
          <span className="logs__stat-num">{stats.today}</span>
          <span className="logs__stat-lbl">오늘 이벤트</span>
        </div>
        <div className="logs__stat-sep" />
        <div className="logs__stat">
          <span className="logs__stat-num">{stats.shown}</span>
          <span className="logs__stat-lbl">조회 기간</span>
        </div>
        <div className="logs__stat-sep" />
        <div className="logs__stat">
          <span className="logs__stat-num" style={{ color: '#DC2626' }}>{stats.error}</span>
          <span className="logs__stat-lbl">오류</span>
        </div>
        <div className="logs__stat-sep" />
        <div className="logs__stat">
          <span className="logs__stat-num" style={{ color: '#B45309' }}>{stats.warning}</span>
          <span className="logs__stat-lbl">경고</span>
        </div>
        <div className="logs__stat-sep" />
        <div className="logs__stat">
          <span className="logs__stat-num" style={{ color: '#3B82F6' }}>{unread}</span>
          <span className="logs__stat-lbl">미확인 알림</span>
        </div>
      </div>

      {/* Severity Timeline */}
      <TimelineBar todayLogs={todayLogs} onClickHour={scrollToHour} />

      {/* Toolbar */}
      <div className="logs__toolbar">
        {/* Date range */}
        <div className="logs__daterange">
          {DATE_PRESETS.map(p => (
            <button
              key={p.key}
              className={`logs__dr-btn${datePreset === p.key ? ' logs__dr-btn--active' : ''}`}
              onClick={() => setDatePreset(p.key)}
            >{p.label}</button>
          ))}
          {datePreset === 'custom' && (
            <>
              <input type="date" className="logs__dr-input" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span className="logs__dr-sep">–</span>
              <input type="date" className="logs__dr-input" value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </>
          )}
        </div>

        {/* Filters */}
        <div className="logs__right-tools">
          <div className="logs__cats">
            {CATEGORIES.map(c => {
              const meta = CATEGORY_META[c];
              const active = category === c;
              return (
                <button
                  key={c}
                  className={`logs__cat${active ? ' logs__cat--active' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {meta && (
                    <span style={{ color: active ? '#fff' : meta.color, display: 'flex' }}>
                      <meta.Icon size={11} />
                    </span>
                  )}
                  {c}
                </button>
              );
            })}
          </div>
          <div className="logs__types">
            {(['all', 'info', 'success', 'warning', 'error'] as const).map(t => (
              <button
                key={t}
                className={`logs__type-btn${typeFilter === t ? ' logs__type-btn--active' : ''}`}
                style={typeFilter === t && t !== 'all' ? {
                  color: TYPE_META[t].color,
                  borderColor: TYPE_META[t].color,
                  background: TYPE_META[t].bg,
                } : undefined}
                onClick={() => setTypeFilter(t)}
              >
                {t === 'all' ? '전체' : t === 'info' ? 'INFO' : t === 'success' ? 'OK' : t === 'warning' ? 'WARN' : 'ERR'}
              </button>
            ))}
          </div>
          <div className="logs__search">
            <Search size={13} className="logs__search-icon" />
            <input
              className="logs__search-input"
              placeholder="이벤트 검색…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="logs__body">
        <div className="logs__col-header">
          <span />
          <span />
          <span>시각</span>
          <span>분류</span>
          <span>이벤트</span>
          <span>레벨</span>
          <span />
        </div>

        <div className="logs__list">
          {/* Pinned section */}
          {pinnedLogs.length > 0 && (
            <div className="logs__pinned">
              <div className="logs__pinned-header">
                <Pin size={10} />
                <span>핀 고정 {pinnedLogs.length}건</span>
              </div>
              {pinnedLogs.map(item => (
                <LogRow key={item.id} item={item} pinned onPin={togglePin} isMember={false} />
              ))}
              <div className="logs__pinned-divider" />
            </div>
          )}

          {/* Date groups */}
          {displayGroups.length === 0 ? (
            <div className="logs__empty">검색 결과가 없습니다</div>
          ) : (
            displayGroups.map(({ date, list }) => (
              <div key={date} className="logs__group">
                <div className="logs__date-label">
                  <span className="logs__date-text">{formatDateLabel(date)}</span>
                  <span className="logs__date-count">{list.length}건</span>
                </div>
                {list.map((entry, i) =>
                  entry.kind === 'cluster' ? (
                    <ClusterSummaryRow
                      key={entry.clusterId}
                      cluster={CLUSTERS.find(c => c.id === entry.clusterId)!}
                      members={entry.members}
                      isExpanded={expanded.has(entry.clusterId)}
                      onToggle={() => toggleCluster(entry.clusterId)}
                    />
                  ) : (
                    <LogRow
                      key={`${entry.item.id}-${i}`}
                      item={entry.item}
                      pinned={pinnedIds.has(entry.item.id)}
                      onPin={togglePin}
                      isMember={entry.isMember}
                    />
                  )
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="logs__toast">
          <RefreshCw size={12} />
          <span>{toastMsg}</span>
        </div>
      )}

    </div>
  );
}
