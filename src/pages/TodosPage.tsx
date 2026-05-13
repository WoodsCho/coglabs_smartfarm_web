import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Plus, CheckCircle2, Circle, Clock, Calendar,
  Wrench, ShieldCheck, Package, FileText, Search,
  AlertTriangle, ClipboardList, ChevronLeft, ChevronRight,
  CalendarDays, Columns3, X, RefreshCw, MessageSquare, Send, Check,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import './TodosPage.css';

/* ── Types ────────────────────────────────────────────────────── */
type TaskStatus = '할 일' | '진행 중' | '완료';
type TaskPriority = '긴급' | '높음' | '보통' | '낮음';
type TaskCategory = '점검' | '방제' | '수확' | '유지보수' | '기록';
type Repeat = 'none' | 'weekly' | 'monthly';
type ViewMode = 'kanban' | 'calendar';
type CalMode = 'month' | 'week';
type CatFilter = '전체' | TaskCategory;

interface Task {
  id: number;
  title: string;
  desc?: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  dueDate: string;
  assignee: string;
  completedAt?: string;
  repeat: Repeat;
}

interface Comment {
  id: number;
  text: string;
  time: string;
}

/* ── Constants / Meta ─────────────────────────────────────────── */
const PRIORITY_META: Record<TaskPriority, { color: string; bg: string; border: string }> = {
  긴급: { color: '#DC2626', bg: '#FEE2E2', border: '#EF4444' },
  높음: { color: '#D97706', bg: '#FEF9C3', border: '#F59E0B' },
  보통: { color: '#4B5563', bg: '#F3F4F6', border: '#D1D5DB' },
  낮음: { color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB' },
};

const CATEGORY_META: Record<TaskCategory, { color: string; bg: string; Icon: LucideIcon }> = {
  점검: { color: '#1D4ED8', bg: '#DBEAFE', Icon: ClipboardList },
  방제: { color: '#15803D', bg: '#DCFCE7', Icon: ShieldCheck },
  수확: { color: '#C2410C', bg: '#FFF7ED', Icon: Package },
  유지보수: { color: '#7C3AED', bg: '#F3E8FF', Icon: Wrench },
  기록: { color: '#0E7490', bg: '#CFFAFE', Icon: FileText },
};

type ColDef = { status: TaskStatus; Icon: LucideIcon; dot: string };
const COLUMNS: ColDef[] = [
  { status: '할 일', Icon: Circle, dot: '#D1D5DB' },
  { status: '진행 중', Icon: Clock, dot: '#3B82F6' },
  { status: '완료', Icon: CheckCircle2, dot: '#16A34A' },
];

const STATUSES: TaskStatus[] = ['할 일', '진행 중', '완료'];
const CAT_FILTERS: CatFilter[] = ['전체', '점검', '방제', '수확', '유지보수', '기록'];
const ASSIGNEES = ['KH', 'JS', 'LM'];
const WEEK_DAYS = ['월', '화', '수', '목', '금', '토', '일'];

const AVATAR_BG: Record<string, string> = {
  KH: '#4F46E5',
  JS: '#0284C7',
  LM: '#16A34A',
};

/* ── Initial Data ─────────────────────────────────────────────── */
function dueIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const INITIAL_TASKS: Task[] = [
  {
    id: 1, title: '양액 pH 재보정',
    desc: 'pH 5.8 이탈 감지됨 — A-1, B-2 구획 우선 점검',
    status: '할 일', priority: '긴급', category: '점검',
    dueDate: dueIn(0), assignee: 'KH', repeat: 'none',
  },
  {
    id: 6, title: 'EC 센서 교정',
    desc: '기준액 준비 완료 — 실측값 비교 후 보정 적용',
    status: '할 일', priority: '높음', category: '점검',
    dueDate: dueIn(-1), assignee: 'KH', repeat: 'monthly',
  },
  {
    id: 2, title: '환기팬 1 베어링 교체',
    desc: '소음 증가 확인 — 부품 재고 확인 후 진행',
    status: '할 일', priority: '높음', category: '유지보수',
    dueDate: dueIn(1), assignee: 'JS', repeat: 'none',
  },
  {
    id: 3, title: 'B-2 구획 방충망 점검',
    status: '할 일', priority: '보통', category: '방제',
    dueDate: dueIn(3), assignee: 'KH', repeat: 'weekly',
  },
  {
    id: 4, title: '월간 수확 보고서 작성',
    desc: '4월 수확량 집계 및 출하 실적 포함',
    status: '할 일', priority: '보통', category: '기록',
    dueDate: dueIn(5), assignee: 'LM', repeat: 'monthly',
  },
  {
    id: 5, title: 'CO₂ 발생기 필터 교체',
    desc: '6개월 주기 정기 점검 일정',
    status: '할 일', priority: '낮음', category: '유지보수',
    dueDate: dueIn(7), assignee: 'JS', repeat: 'none',
  },
  {
    id: 7, title: '청경채 A-1 수확 작업',
    desc: '예상 수확량 12.4 kg, 등급 A 예측',
    status: '진행 중', priority: '높음', category: '수확',
    dueDate: dueIn(0), assignee: 'KH', repeat: 'none',
  },
  {
    id: 8, title: '조명 스케줄 최적화',
    desc: '일조 시간 16h → 14h 조정 검토 중',
    status: '진행 중', priority: '보통', category: '점검',
    dueDate: dueIn(1), assignee: 'LM', repeat: 'none',
  },
  {
    id: 9, title: '신규 작물 재배 매뉴얼 정리',
    desc: '방울토마토 품종 추가 — 재배 DB 업데이트',
    status: '진행 중', priority: '낮음', category: '기록',
    dueDate: dueIn(4), assignee: 'JS', repeat: 'none',
  },
  {
    id: 10, title: '수온 센서 교정',
    desc: '보정값 +0.3°C 적용 완료',
    status: '완료', priority: '높음', category: '점검',
    dueDate: dueIn(-1), assignee: 'KH', completedAt: dueIn(-1), repeat: 'none',
  },
  {
    id: 11, title: 'LED 2 램프 교체',
    status: '완료', priority: '긴급', category: '유지보수',
    dueDate: dueIn(-2), assignee: 'JS', completedAt: dueIn(-2), repeat: 'none',
  },
  {
    id: 12, title: '주간 환경 보고서 제출',
    status: '완료', priority: '보통', category: '기록',
    dueDate: dueIn(-3), assignee: 'LM', completedAt: dueIn(-3), repeat: 'weekly',
  },
  {
    id: 13, title: '바질 A-2 개화 단계 전환',
    desc: '조명 스펙트럼 변경 및 양액 비율 조정 완료',
    status: '완료', priority: '보통', category: '수확',
    dueDate: dueIn(-2), assignee: 'KH', completedAt: dueIn(-2), repeat: 'none',
  },
];

/* ── Helpers ──────────────────────────────────────────────────── */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDue(ymd: string, status: TaskStatus) {
  const t = todayStr();
  const diff = Math.round((new Date(ymd).getTime() - new Date(t).getTime()) / 86400000);
  const overdue = diff < 0 && status !== '완료';
  const isToday = diff === 0;
  let text: string;
  if (diff === 0) text = '오늘';
  else if (diff === 1) text = '내일';
  else if (diff === -1) text = '어제';
  else if (diff > 1) text = `${diff}일 후`;
  else text = `${Math.abs(diff)}일 전`;
  return { text, overdue, isToday };
}

function fmtYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtMonthLabel(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

function fmtWeekLabel(cells: Date[]): string {
  const a = cells[0], b = cells[6];
  return `${a.getMonth() + 1}/${a.getDate()} — ${b.getMonth() + 1}/${b.getDate()}`;
}

function getMonthCells(date: Date): Date[] {
  const year = date.getFullYear(), month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  let dow = firstDay.getDay();
  dow = dow === 0 ? 6 : dow - 1; // Mon = 0
  const cells: Date[] = [];
  for (let i = dow; i > 0; i--) cells.push(new Date(year, month, 1 - i));
  const lastDate = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= lastDate; i++) cells.push(new Date(year, month, i));
  while (cells.length < 35 || cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  return cells.slice(0, 42);
}

function getWeekCells(date: Date): Date[] {
  const day = date.getDay();
  const mon = new Date(date);
  mon.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

/* ── TaskCard ─────────────────────────────────────────────────── */
interface TaskCardProps {
  task: Task;
  isEditing: boolean;
  editTitle: string;
  editDesc: string;
  onEditTitle: (v: string) => void;
  onEditDesc: (v: string) => void;
  onDoubleClickTitle: (task: Task) => void;
  onSave: () => void;
  onCancel: () => void;
  onComment: (task: Task) => void;
  commentCount: number;
}

function TaskCard({
  task, isEditing, editTitle, editDesc,
  onEditTitle, onEditDesc, onDoubleClickTitle, onSave, onCancel,
  onComment, commentCount,
}: TaskCardProps) {
  const pm = PRIORITY_META[task.priority];
  const cm = CATEGORY_META[task.category];
  const due = formatDue(task.dueDate, task.status);
  const done = task.status === '완료';
  const CatIcon = cm.Icon;
  const avatarBg = AVATAR_BG[task.assignee] ?? '#6B7280';
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) titleRef.current?.focus();
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="task-card task-card--editing" style={{ borderLeftColor: pm.border }}>
        <input
          ref={titleRef}
          className="task-card__edit-input"
          value={editTitle}
          onChange={e => onEditTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSave();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="작업 제목"
        />
        <input
          className="task-card__edit-input task-card__edit-input--desc"
          value={editDesc}
          onChange={e => onEditDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
          placeholder="설명 (선택사항)"
        />
        <div className="task-card__edit-actions">
          <button className="task-card__edit-save" onClick={onSave}>
            <Check size={10} /> 저장
          </button>
          <button className="task-card__edit-cancel" onClick={onCancel}>
            <X size={10} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`task-card${done ? ' task-card--done' : ''}`}
      style={{ borderLeftColor: pm.border }}
    >
      <div className="task-card__top">
        <span
          className="task-card__title"
          style={{ textDecoration: done ? 'line-through' : 'none', color: done ? '#9CA3AF' : '#111827' }}
          onDoubleClick={() => onDoubleClickTitle(task)}
          title="더블클릭: 제목 편집"
        >
          {task.title}
        </span>
        <span className="task-card__priority" style={{ color: pm.color, background: pm.bg }}>
          {task.priority}
        </span>
      </div>

      {task.desc && <p className="task-card__desc">{task.desc}</p>}

      <div className="task-card__meta">
        <span className="task-card__cat" style={{ color: cm.color, background: cm.bg }}>
          <CatIcon size={10} />
          {task.category}
        </span>

        {task.repeat !== 'none' && (
          <span className="task-card__repeat">
            <RefreshCw size={9} />
            {task.repeat === 'weekly' ? '주' : '월'}
          </span>
        )}

        <span
          className={`task-card__due${due.overdue ? ' task-card__due--overdue' : ''}${due.isToday && !done ? ' task-card__due--today' : ''}`}
        >
          {due.overdue ? <AlertTriangle size={9} /> : <Calendar size={10} />}
          {due.text}
        </span>

        <span className="task-card__avatar" style={{ background: avatarBg }} title={task.assignee}>
          {task.assignee}
        </span>

        <button
          className={`task-card__comment-btn${commentCount > 0 ? ' task-card__comment-btn--has' : ''}`}
          onClick={e => { e.stopPropagation(); onComment(task); }}
          title="메모 보기"
        >
          <MessageSquare size={10} />
          {commentCount > 0 && <span className="task-card__comment-count">{commentCount}</span>}
        </button>
      </div>
    </div>
  );
}

/* ── DraggableCard ────────────────────────────────────────────── */
function DraggableCard(props: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: props.task.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: transform ? CSS.Translate.toString(transform) : undefined }}
      className={`draggable-wrap${isDragging ? ' draggable-wrap--dragging' : ''}`}
    >
      <TaskCard {...props} />
    </div>
  );
}

/* ── KanbanColumn ─────────────────────────────────────────────── */
interface KanbanColProps {
  colDef: ColDef;
  tasks: Task[];
  editingId: number | null;
  editTitle: string;
  editDesc: string;
  onEditTitle: (v: string) => void;
  onEditDesc: (v: string) => void;
  onStartEdit: (task: Task) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onComment: (task: Task) => void;
  commentsMap: Record<number, Comment[]>;
  addingTo: TaskStatus | null;
  newTaskTitle: string;
  onNewTaskTitleChange: (v: string) => void;
  onQuickAdd: (status: TaskStatus) => void;
  onStartAdding: (status: TaskStatus) => void;
  onCancelAdding: () => void;
  children?: ReactNode;
}

function KanbanColumn({
  colDef, tasks, editingId, editTitle, editDesc,
  onEditTitle, onEditDesc, onStartEdit, onSaveEdit, onCancelEdit,
  onComment, commentsMap, addingTo, newTaskTitle,
  onNewTaskTitleChange, onQuickAdd, onStartAdding, onCancelAdding,
}: KanbanColProps) {
  const { status, Icon: ColIcon, dot } = colDef;
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const addInputRef = useRef<HTMLInputElement>(null);
  const isAdding = addingTo === status;

  useEffect(() => {
    if (isAdding) addInputRef.current?.focus();
  }, [isAdding]);

  return (
    <div className={`todos__col${isOver ? ' todos__col--over' : ''}`}>
      <div className="todos__col-header">
        <div className="todos__col-title">
          <span className="todos__col-dot" style={{ background: dot }} />
          <span style={{ color: dot === '#D1D5DB' ? '#9CA3AF' : dot, display: 'flex' }}>
            <ColIcon size={13} />
          </span>
          <span className="todos__col-name">{status}</span>
        </div>
        <span className="todos__col-count">{tasks.length}</span>
      </div>

      <div ref={setNodeRef} className={`todos__col-body${isOver ? ' todos__col-body--over' : ''}`}>
        {tasks.length === 0 && !isAdding && (
          <div className="todos__col-empty">작업 없음</div>
        )}
        {tasks.map(task => (
          <DraggableCard
            key={task.id}
            task={task}
            isEditing={editingId === task.id}
            editTitle={editTitle}
            editDesc={editDesc}
            onEditTitle={onEditTitle}
            onEditDesc={onEditDesc}
            onDoubleClickTitle={onStartEdit}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            onComment={onComment}
            commentCount={(commentsMap[task.id] ?? []).length}
          />
        ))}

        {isAdding ? (
          <div className="todos__quick-add">
            <input
              ref={addInputRef}
              className="todos__quick-add-input"
              placeholder="제목 입력 후 Enter"
              value={newTaskTitle}
              onChange={e => onNewTaskTitleChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onQuickAdd(status);
                if (e.key === 'Escape') onCancelAdding();
              }}
            />
            <div className="todos__quick-add-actions">
              <button className="todos__quick-add-save" onClick={() => onQuickAdd(status)}>추가</button>
              <button className="todos__quick-add-cancel" onClick={onCancelAdding}><X size={11} /></button>
            </div>
          </div>
        ) : (
          <button className="todos__col-add" onClick={() => onStartAdding(status)}>
            <Plus size={11} /> 추가
          </button>
        )}
      </div>
    </div>
  );
}

/* ── CalendarView ─────────────────────────────────────────────── */
interface CalendarViewProps {
  tasks: Task[];
  calMode: CalMode;
  calDate: Date;
  onNavPrev: () => void;
  onNavNext: () => void;
  onToggleMode: () => void;
}

function CalendarView({ tasks, calMode, calDate, onNavPrev, onNavNext, onToggleMode }: CalendarViewProps) {
  const today = todayStr();

  if (calMode === 'month') {
    const cells = getMonthCells(calDate);
    const curMonth = calDate.getMonth();
    return (
      <div className="cal">
        <div className="cal__nav">
          <button className="cal__nav-btn" onClick={onNavPrev}><ChevronLeft size={14} /></button>
          <span className="cal__nav-label">{fmtMonthLabel(calDate)}</span>
          <button className="cal__nav-btn" onClick={onNavNext}><ChevronRight size={14} /></button>
          <button className="cal__mode-btn" onClick={onToggleMode}>주간 보기</button>
        </div>
        <div className="cal__weekdays">
          {WEEK_DAYS.map(d => <div key={d} className="cal__weekday">{d}</div>)}
        </div>
        <div className="cal__grid">
          {cells.map((cell, i) => {
            const ymd = fmtYMD(cell);
            const isToday = ymd === today;
            const isOther = cell.getMonth() !== curMonth;
            const dayTasks = tasks.filter(t => t.dueDate === ymd);
            return (
              <div
                key={i}
                className={`cal__cell${isOther ? ' cal__cell--other' : ''}${isToday ? ' cal__cell--today' : ''}`}
              >
                <div className="cal__cell-day">{cell.getDate()}</div>
                <div className="cal__cell-tasks">
                  {dayTasks.slice(0, 3).map(t => {
                    const pm = PRIORITY_META[t.priority];
                    return (
                      <div
                        key={t.id}
                        className={`cal__chip${t.status === '완료' ? ' cal__chip--done' : ''}`}
                        style={{ borderLeftColor: pm.border }}
                      >
                        {t.title}
                      </div>
                    );
                  })}
                  {dayTasks.length > 3 && (
                    <div className="cal__chip cal__chip--more">+{dayTasks.length - 3}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Week view
  const cells = getWeekCells(calDate);
  return (
    <div className="cal">
      <div className="cal__nav">
        <button className="cal__nav-btn" onClick={onNavPrev}><ChevronLeft size={14} /></button>
        <span className="cal__nav-label">{fmtWeekLabel(cells)}</span>
        <button className="cal__nav-btn" onClick={onNavNext}><ChevronRight size={14} /></button>
        <button className="cal__mode-btn" onClick={onToggleMode}>월간 보기</button>
      </div>
      <div className="cal__week">
        {cells.map((cell, i) => {
          const ymd = fmtYMD(cell);
          const isToday = ymd === today;
          const dayTasks = tasks.filter(t => t.dueDate === ymd);
          return (
            <div key={i} className={`cal__week-col${isToday ? ' cal__week-col--today' : ''}`}>
              <div className="cal__week-header">
                <span className="cal__week-dow">{WEEK_DAYS[i]}</span>
                <span className={`cal__week-date${isToday ? ' cal__week-date--today' : ''}`}>
                  {cell.getDate()}
                </span>
              </div>
              <div className="cal__week-body">
                {dayTasks.map(t => {
                  const pm = PRIORITY_META[t.priority];
                  const avatarBg = AVATAR_BG[t.assignee] ?? '#6B7280';
                  return (
                    <div
                      key={t.id}
                      className={`cal__week-task${t.status === '완료' ? ' cal__week-task--done' : ''}`}
                      style={{ borderLeftColor: pm.border }}
                    >
                      <div className="cal__week-task-title">{t.title}</div>
                      <div className="cal__week-task-meta">
                        <span className="cal__week-task-avatar" style={{ background: avatarBg }}>
                          {t.assignee}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── CommentPanel ─────────────────────────────────────────────── */
interface CommentPanelProps {
  task: Task;
  comments: Comment[];
  commentInput: string;
  onCommentChange: (v: string) => void;
  onAddComment: () => void;
  onClose: () => void;
}

function CommentPanel({ task, comments, commentInput, onCommentChange, onAddComment, onClose }: CommentPanelProps) {
  const pm = PRIORITY_META[task.priority];
  const cm = CATEGORY_META[task.category];
  const CatIcon = cm.Icon;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [comments.length]);

  return (
    <>
      <div className="todos__panel-backdrop" onClick={onClose} />
      <div className="todos__panel">
        <div className="todos__panel-header">
          <div className="todos__panel-title-row">
            <span className="todos__panel-title">{task.title}</span>
            <button className="todos__panel-close" onClick={onClose}><X size={14} /></button>
          </div>
          <div className="todos__panel-chips">
            <span className="todos__panel-cat" style={{ color: cm.color, background: cm.bg }}>
              <CatIcon size={10} />{task.category}
            </span>
            <span className="todos__panel-pri" style={{ color: pm.color, background: pm.bg }}>
              {task.priority}
            </span>
            <span className="todos__panel-avatar" style={{ background: AVATAR_BG[task.assignee] ?? '#6B7280' }}>
              {task.assignee}
            </span>
          </div>
        </div>

        {task.desc && <p className="todos__panel-desc">{task.desc}</p>}

        <div className="todos__panel-section">메모 · 이력</div>

        <div ref={scrollRef} className="todos__panel-comments">
          {comments.length === 0 && (
            <div className="todos__panel-empty">메모가 없습니다</div>
          )}
          {comments.map(c => (
            <div key={c.id} className="todos__panel-comment">
              <div className="todos__panel-comment-text">{c.text}</div>
              <div className="todos__panel-comment-time">{c.time}</div>
            </div>
          ))}
        </div>

        <div className="todos__panel-input-row">
          <input
            className="todos__panel-input"
            placeholder="메모 추가…"
            value={commentInput}
            onChange={e => onCommentChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAddComment(); }
            }}
          />
          <button
            className="todos__panel-send"
            onClick={onAddComment}
            disabled={!commentInput.trim()}
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </>
  );
}

/* ── TodosPage ────────────────────────────────────────────────── */
export default function TodosPage() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [catFilter, setCatFilter] = useState<CatFilter>('전체');
  const [assigneeFilter, setAssignee] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [calMode, setCalMode] = useState<CalMode>('month');
  const [calDate, setCalDate] = useState(new Date());
  const [showBanner, setShowBanner] = useState(true);
  const [addingTo, setAddingTo] = useState<TaskStatus | null>(null);
  const [newTaskTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [panelTask, setPanelTask] = useState<Task | null>(null);
  const [commentsMap, setCommentsMap] = useState<Record<number, Comment[]>>({});
  const [commentInput, setCommentInput] = useState('');

  const today = todayStr();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  /* ── Derived ── */
  const overdueCount = tasks.filter(t => t.dueDate < today && t.status !== '완료').length;
  const todayCount = tasks.filter(t => t.dueDate === today && t.status !== '완료').length;
  const inProgCount = tasks.filter(t => t.status === '진행 중').length;
  const doneCount = tasks.filter(t => t.status === '완료').length;

  const filtered = useMemo(() => tasks.filter(task => {
    if (catFilter !== '전체' && task.category !== catFilter) return false;
    if (assigneeFilter && task.assignee !== assigneeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!task.title.toLowerCase().includes(q) && !task.desc?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [tasks, catFilter, assigneeFilter, search]);

  /* ── DnD ── */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id as number;
    const newStatus = String(over.id);
    if (!STATUSES.includes(newStatus as TaskStatus)) return;
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      return {
        ...t,
        status: newStatus as TaskStatus,
        completedAt: newStatus === '완료' ? today : t.completedAt,
      };
    }));
  }

  /* ── Inline edit ── */
  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditDesc(task.desc ?? '');
  }
  function saveEdit() {
    if (editingId === null) return;
    setTasks(prev => prev.map(t =>
      t.id === editingId
        ? { ...t, title: editTitle.trim() || t.title, desc: editDesc.trim() || undefined }
        : t
    ));
    setEditingId(null);
  }

  /* ── Quick add ── */
  function quickAdd(status: TaskStatus) {
    if (!newTaskTitle.trim()) { setAddingTo(null); return; }
    setTasks(prev => [...prev, {
      id: Date.now(),
      title: newTaskTitle.trim(),
      status,
      priority: '보통',
      category: '점검',
      dueDate: today,
      assignee: assigneeFilter ?? 'KH',
      repeat: 'none',
    }]);
    setNewTitle('');
    setAddingTo(null);
  }

  /* ── Comments ── */
  function addComment() {
    if (!panelTask || !commentInput.trim()) return;
    const c: Comment = {
      id: Date.now(),
      text: commentInput.trim(),
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    };
    setCommentsMap(prev => ({ ...prev, [panelTask.id]: [...(prev[panelTask.id] ?? []), c] }));
    setCommentInput('');
  }

  /* ── Calendar nav ── */
  function navPrev() {
    setCalDate(prev => {
      const d = new Date(prev);
      if (calMode === 'month') d.setMonth(d.getMonth() - 1);
      else d.setDate(d.getDate() - 7);
      return d;
    });
  }
  function navNext() {
    setCalDate(prev => {
      const d = new Date(prev);
      if (calMode === 'month') d.setMonth(d.getMonth() + 1);
      else d.setDate(d.getDate() + 7);
      return d;
    });
  }

  /* ── Render ── */
  return (
    <div className={`todos${panelTask ? ' todos--panel-open' : ''}`}>

      {/* Overdue banner */}
      {showBanner && (overdueCount + todayCount) > 0 && (
        <div className="todos__banner">
          <AlertTriangle size={13} />
          <span>
            {overdueCount > 0 && <strong>기한 초과 {overdueCount}건</strong>}
            {overdueCount > 0 && todayCount > 0 && ' · '}
            {todayCount > 0 && <strong>오늘 마감 {todayCount}건</strong>}
            {' '}주의가 필요합니다.
          </span>
          <button className="todos__banner-close" onClick={() => setShowBanner(false)}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="todos__header">
        <div className="todos__header-right">
          <div className="todos__view-toggle">
            <button
              className={`todos__view-btn${viewMode === 'kanban' ? ' todos__view-btn--active' : ''}`}
              onClick={() => setViewMode('kanban')}
            >
              <Columns3 size={12} /> 칸반
            </button>
            <button
              className={`todos__view-btn${viewMode === 'calendar' ? ' todos__view-btn--active' : ''}`}
              onClick={() => setViewMode('calendar')}
            >
              <CalendarDays size={12} /> 달력
            </button>
          </div>
          <button className="todos__add-btn">
            <Plus size={13} /><span>새 작업</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="todos__stats">
        <div className="todos__stat">
          <span className="todos__stat-num">{tasks.length}</span>
          <span className="todos__stat-lbl">전체 작업</span>
        </div>
        <div className="todos__stat-sep" />
        <div className="todos__stat">
          <span className="todos__stat-num" style={{ color: '#1D4ED8' }}>{inProgCount}</span>
          <span className="todos__stat-lbl">진행 중</span>
        </div>
        <div className="todos__stat-sep" />
        <div className="todos__stat">
          <span className="todos__stat-num" style={{ color: '#16A34A' }}>{doneCount}</span>
          <span className="todos__stat-lbl">완료</span>
        </div>
        <div className="todos__stat-sep" />
        <div className="todos__stat">
          <span className="todos__stat-num" style={{ color: '#DC2626' }}>{overdueCount}</span>
          <span className="todos__stat-lbl">기한 초과</span>
        </div>
        <div className="todos__stat-sep" />
        <div className="todos__stat">
          <span className="todos__stat-num">
            {tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0}
            <span className="todos__stat-unit">%</span>
          </span>
          <span className="todos__stat-lbl">완료율</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="todos__toolbar">
        <div className="todos__filters">
          <div className="todos__cats">
            {CAT_FILTERS.map(c => {
              const meta = c !== '전체' ? CATEGORY_META[c as TaskCategory] : null;
              const CIcon = meta?.Icon;
              return (
                <button
                  key={c}
                  className={`todos__cat${catFilter === c ? ' todos__cat--active' : ''}`}
                  onClick={() => setCatFilter(c)}
                >
                  {CIcon && meta && (
                    <span style={{ color: catFilter === c ? '#fff' : meta.color, display: 'flex' }}>
                      <CIcon size={11} />
                    </span>
                  )}
                  {c}
                </button>
              );
            })}
          </div>
          <div className="todos__assignees">
            {ASSIGNEES.map(a => (
              <button
                key={a}
                className={`todos__assignee${assigneeFilter === a ? ' todos__assignee--active' : ''}`}
                style={assigneeFilter === a ? { background: AVATAR_BG[a], borderColor: AVATAR_BG[a] } : undefined}
                onClick={() => setAssignee(prev => prev === a ? null : a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="todos__search">
          <Search size={13} className="todos__search-icon" />
          <input
            className="todos__search-input"
            placeholder="작업 검색…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="todos__content">
        {viewMode === 'kanban' ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="todos__board">
              {COLUMNS.map(colDef => (
                <KanbanColumn
                  key={colDef.status}
                  colDef={colDef}
                  tasks={filtered.filter(t => t.status === colDef.status)}
                  editingId={editingId}
                  editTitle={editTitle}
                  editDesc={editDesc}
                  onEditTitle={setEditTitle}
                  onEditDesc={setEditDesc}
                  onStartEdit={startEdit}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => setEditingId(null)}
                  onComment={setPanelTask}
                  commentsMap={commentsMap}
                  addingTo={addingTo}
                  newTaskTitle={newTaskTitle}
                  onNewTaskTitleChange={setNewTitle}
                  onQuickAdd={quickAdd}
                  onStartAdding={setAddingTo}
                  onCancelAdding={() => { setAddingTo(null); setNewTitle(''); }}
                />
              ))}
            </div>
          </DndContext>
        ) : (
          <CalendarView
            tasks={filtered}
            calMode={calMode}
            calDate={calDate}
            onNavPrev={navPrev}
            onNavNext={navNext}
            onToggleMode={() => setCalMode(prev => prev === 'month' ? 'week' : 'month')}
          />
        )}
      </div>

      {/* Comment / Memo Panel */}
      {panelTask && (
        <CommentPanel
          task={panelTask}
          comments={commentsMap[panelTask.id] ?? []}
          commentInput={commentInput}
          onCommentChange={setCommentInput}
          onAddComment={addComment}
          onClose={() => { setPanelTask(null); setCommentInput(''); }}
        />
      )}
    </div>
  );
}
