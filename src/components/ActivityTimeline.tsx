import { useState } from 'react';
import './ActivityTimeline.css';

type Category = '전체' | '시스템' | '사용자' | '알림' | '장비';

interface ActivityItem {
  id: number;
  time: string;
  category: Exclude<Category, '전체'>;
  title: string;
  desc?: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

const MOCK_ITEMS: ActivityItem[] = [
  { id: 1,  time: '09:12', category: '장비',   type: 'success', title: 'LED 1 ON',          desc: '조도 기준치 달성' },
  { id: 2,  time: '09:05', category: '시스템',  type: 'info',    title: '환경 데이터 수집',    desc: '정상 수집 완료' },
  { id: 3,  time: '08:58', category: '알림',   type: 'warning', title: 'EC 수치 상승',        desc: 'EC 2.6 dS/m → 점검 필요' },
  { id: 4,  time: '08:45', category: '장비',   type: 'info',    title: '양액펌프 1 가동',     desc: '오늘 첫 가동' },
  { id: 5,  time: '08:30', category: '시스템',  type: 'info',    title: '시스템 시작' },
  { id: 6,  time: '08:20', category: '사용자',  type: 'info',    title: 'CO2 목표값 변경',    desc: '900 → 1000 ppm' },
  { id: 7,  time: '07:55', category: '알림',   type: 'error',   title: '온도 경보',           desc: '28.5°C — 냉방 가동' },
  { id: 8,  time: '07:40', category: '장비',   type: 'success', title: '쿨러 1 가동',         desc: '자동 제어' },
  { id: 9,  time: '07:30', category: '사용자',  type: 'info',    title: '목표 온도 변경',      desc: '22 → 24°C' },
  { id: 10, time: '07:10', category: '장비',   type: 'info',    title: '환기팬 2 대기',       desc: '목표 온도 달성' },
  { id: 11, time: '06:50', category: '시스템',  type: 'success', title: '일일 리포트 생성',    desc: '어제 데이터 집계 완료' },
  { id: 12, time: '06:30', category: '장비',   type: 'info',    title: 'LED 2 OFF',          desc: '야간 스케줄' },
  { id: 13, time: '06:00', category: '알림',   type: 'warning', title: 'pH 저하',             desc: 'pH 5.8 → 조정 필요' },
  { id: 14, time: '05:45', category: '장비',   type: 'success', title: '양액 혼합 완료',       desc: 'Mixer 작동 후 정지' },
  { id: 15, time: '05:20', category: '시스템',  type: 'info',    title: '새벽 점검 통과' },
  { id: 16, time: '00:00', category: '시스템',  type: 'info',    title: '자동 백업 완료' },
];

const CATEGORIES: Category[] = ['전체', '시스템', '사용자', '알림', '장비'];

const TYPE_DOT: Record<string, string> = {
  info: '#3b82f6', success: '#10b981', warning: '#f59e0b', error: '#ef4444',
};

const CATEGORY_COLOR: Record<string, string> = {
  시스템: '#6366f1', 사용자: '#3b82f6', 알림: '#f59e0b', 장비: '#10b981',
};

export default function ActivityTimeline() {
  const [active, setActive] = useState<Category>('전체');

  const items = active === '전체' ? MOCK_ITEMS : MOCK_ITEMS.filter(i => i.category === active);

  return (
    <div className="timeline">
      <div className="timeline__header">
        <h3 className="timeline__title">활동 로그</h3>
        <div className="timeline__tabs">
          {CATEGORIES.map(c => (
            <button
              key={c}
              className={`timeline__tab ${active === c ? 'timeline__tab--active' : ''}`}
              onClick={() => setActive(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="timeline__list">
        {items.map(item => (
          <div key={item.id} className="timeline__item">
            <div className="timeline__dot" style={{ background: TYPE_DOT[item.type] }} />
            <div className="timeline__line" />
            <div className="timeline__content">
              <div className="timeline__meta">
                <span className="timeline__time">{item.time}</span>
                <span className="timeline__category" style={{ color: CATEGORY_COLOR[item.category] }}>
                  {item.category}
                </span>
              </div>
              <span className="timeline__event">{item.title}</span>
              {item.desc && <span className="timeline__desc">{item.desc}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
