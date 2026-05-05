import './TaskPanel.css';

type Priority = '긴급' | '주의' | '보통' | '낮음';

interface Task {
  id: number;
  title: string;
  desc?: string;
  dueDate: string;
  priority: Priority;
  done: boolean;
}

const MOCK_TASKS: Task[] = [
  { id: 1, title: '스마트팜 pH 센서 터미널 교체', desc: '배터리 소모 10% → 정상 소모로 저하 시작', dueDate: '오늘까지', priority: '긴급', done: false },
  { id: 2, title: 'C종 LED 3번 점검', desc: '응답 없음 상태 → 연결부 등 점검 필요', dueDate: '오늘까지', priority: '주의', done: false },
  { id: 3, title: '순환펌프 밸브 점검', desc: '가동 시간 720시간 도달 → 정기 점검 시일', dueDate: '5시간 후', priority: '주의', done: false },
  { id: 4, title: '호흡 배양액 교체', desc: '마지막 14일 → 교환 날짜 도달', dueDate: '1주 남음', priority: '보통', done: false },
];

const PRIORITY_COLOR: Record<Priority, { bg: string; text: string }> = {
  긴급: { bg: '#FEE2E2', text: '#DC2626' },
  주의: { bg: '#FEF9C3', text: '#CA8A04' },
  보통: { bg: '#FFF7ED', text: '#EA580C' },
  낮음: { bg: '#F0FDF4', text: '#16A34A' },
};

const PRIORITY_DOT: Record<Priority, string> = {
  긴급: '#EF4444', 주의: '#F59E0B', 보통: '#F97316', 낮음: '#22C55E',
};

export default function TaskPanel() {
  const doneCount = MOCK_TASKS.filter(t => t.done).length;
  const total     = MOCK_TASKS.length;

  return (
    <div className="task-panel">
      <div className="task-panel__header">
        <div className="task-panel__title-row">
          <span className="task-panel__title">작업 관리</span>
          <span className="task-panel__count">{doneCount}/{total} 완료</span>
        </div>
        <button className="task-panel__link-btn">내 할일</button>
      </div>

      <div className="task-panel__list">
        {MOCK_TASKS.map(task => {
          const pc = PRIORITY_COLOR[task.priority];
          return (
            <div key={task.id} className={`task-item ${task.done ? 'task-item--done' : ''}`}>
              <span
                className="task-item__dot"
                style={{ background: PRIORITY_DOT[task.priority] }}
              />
              <div className="task-item__body">
                <div className="task-item__top">
                  <span className="task-item__title">{task.title}</span>
                  <span
                    className="task-item__badge"
                    style={{ background: pc.bg, color: pc.text }}
                  >
                    {task.priority}
                  </span>
                </div>
                {task.desc && <span className="task-item__desc">{task.desc}</span>}
                <span className="task-item__due">{task.dueDate}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="task-panel__footer">
        내 할일 보기 &gt;
      </div>
    </div>
  );
}
