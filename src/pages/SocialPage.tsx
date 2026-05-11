import { useMemo, useState } from 'react';
import { Heart, Users, Play, Pause, BookOpen, Sprout, AlertTriangle, Settings as Cog, Scissors, NotebookPen } from 'lucide-react';
import { useFarm } from '../contexts/FarmContext';
import type { StoryEvent } from '../types/farm';
import './SocialPage.css';

const TYPE_ICON: Record<StoryEvent['type'], JSX.Element> = {
  식재:     <Sprout size={14} />,
  단계전환: <BookOpen size={14} />,
  경보:     <AlertTriangle size={14} />,
  제어:     <Cog size={14} />,
  수확:     <Scissors size={14} />,
  메모:     <NotebookPen size={14} />,
};
const TYPE_COLOR: Record<StoryEvent['type'], string> = {
  식재: '#22C55E', 단계전환: '#3B82F6', 경보: '#EF4444',
  제어: '#9CA3AF', 수확: '#F97316', 메모: '#8B5CF6',
};

function Timelapse() {
  const [playing, setPlaying] = useState(false);
  const [day, setDay] = useState(15);
  const max = 32;
  return (
    <div className="so-timelapse">
      <div className="so-timelapse__frame">
        <div className="so-timelapse__scene" style={{ filter: `hue-rotate(${day * 3}deg) brightness(${0.7 + day / max * 0.5})` }}>
          <div className="so-plant" style={{ height: `${20 + day * 2.5}%` }}>
            <div className="so-plant__stem" />
            <div className="so-plant__leaf so-plant__leaf--l" style={{ transform: `scale(${0.4 + day / max * 0.8})` }} />
            <div className="so-plant__leaf so-plant__leaf--r" style={{ transform: `scale(${0.4 + day / max * 0.8})` }} />
            {day > 20 && <div className="so-plant__fruit" />}
          </div>
        </div>
        <div className="so-timelapse__overlay">Day {day} / {max}</div>
      </div>
      <div className="so-timelapse__ctrl">
        <button onClick={() => setPlaying(p => !p)} className="so-tl-btn">
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? '일시정지' : '재생'}
        </button>
        <input type="range" min={0} max={max} value={day}
          onChange={e => setDay(Number(e.target.value))}
          className="so-tl-range" />
        <span className="so-tl-day">Day {day}</span>
      </div>
      <p className="so-timelapse__hint">로메인 상추 A-1 구획의 식재부터 현재까지 — 카드로 공유 가능</p>
    </div>
  );
}

export default function SocialPage() {
  const { storyEvents, neighbors, cheerNeighbor } = useFarm();
  const [filter, setFilter] = useState<StoryEvent['type'] | 'all'>('all');

  const events = useMemo(() => {
    const list = filter === 'all' ? storyEvents : storyEvents.filter(e => e.type === filter);
    return [...list].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [storyEvents, filter]);

  const filters: Array<StoryEvent['type'] | 'all'> = ['all', '식재', '단계전환', '수확', '경보', '제어', '메모'];

  return (
    <div className="so-page">
      <section className="so-section so-section--hero">
        <h2><BookOpen size={18} /> 농장 타임랩스</h2>
        <Timelapse />
      </section>

      <div className="so-grid">
        <section className="so-section">
          <h2><BookOpen size={18} /> 농장 스토리북</h2>
          <div className="so-filters">
            {filters.map(f => (
              <button key={f} className={`so-filter ${filter === f ? 'is-on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? '전체' : f}
              </button>
            ))}
          </div>
          <div className="so-timeline">
            {events.map(e => (
              <div key={e.id} className="so-evt">
                <div className="so-evt__dot" style={{ background: TYPE_COLOR[e.type] }}>{TYPE_ICON[e.type]}</div>
                <div className="so-evt__body">
                  <div className="so-evt__head">
                    <strong>{e.title}</strong>
                    <span>{new Date(e.occurredAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {e.description && <p>{e.description}</p>}
                </div>
              </div>
            ))}
            {events.length === 0 && <div className="so-empty">기록이 없습니다.</div>}
          </div>
        </section>

        <section className="so-section">
          <h2><Users size={18} /> 이웃 농장</h2>
          <p className="so-section__hint">다른 임대인의 농장을 방문하고 응원을 보내보세요.</p>
          <div className="so-neighbors">
            {neighbors.map(n => (
              <div key={n.id} className="so-neighbor">
                <div className="so-neighbor__avatar" style={{ background: n.avatarColor }}>
                  {n.ownerName[0]}
                  {n.online && <span className="so-neighbor__dot" />}
                </div>
                <div className="so-neighbor__info">
                  <strong>{n.farmName}</strong>
                  <span>{n.ownerName} · 주작물 {n.mainCrop}</span>
                  <span className="so-neighbor__lv">Lv.{n.level}</span>
                </div>
                <button className="so-cheer" onClick={() => cheerNeighbor(n.id)}>
                  <Heart size={13} fill="#EF4444" color="#EF4444" /> {n.cheers}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
