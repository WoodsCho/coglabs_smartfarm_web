import { useEffect, useRef, useState } from 'react';
import { Bell, AlertTriangle, TrendingUp, Info, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFarm } from '../contexts/FarmContext';
import type { NotificationKind } from '../types/farm';
import './NotificationCenter.css';

const ICON: Record<NotificationKind, JSX.Element> = {
  risk:        <AlertTriangle size={14} />,
  opportunity: <TrendingUp size={14} />,
  info:        <Info size={14} />,
};
const COLOR: Record<NotificationKind, string> = {
  risk:        '#EF4444',
  opportunity: '#10B981',
  info:        '#3B82F6',
};

const timeAgo = (iso: string) => {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return `${Math.floor(sec / 86400)}일 전`;
};

export default function NotificationCenter() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useFarm();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unread = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="noti" ref={ref}>
      <button className="topheader__icon-btn" aria-label="알림" onClick={() => setOpen(o => !o)}>
        <Bell size={22} color="#6B7280" />
        {unread > 0 && <span className="noti__badge">{unread}</span>}
      </button>
      {open && (
        <div className="noti__panel">
          <div className="noti__head">
            <strong>알림</strong>
            {unread > 0 && (
              <button className="noti__mark-all" onClick={markAllNotificationsRead}>
                <Check size={12} /> 모두 읽음
              </button>
            )}
          </div>
          <div className="noti__list">
            {notifications.length === 0 && <div className="noti__empty">새 알림이 없습니다.</div>}
            {notifications.map(n => (
              <button
                key={n.id}
                className={`noti__item ${n.read ? '' : 'is-unread'}`}
                onClick={() => {
                  markNotificationRead(n.id);
                  if (n.href) { setOpen(false); navigate(n.href); }
                }}
              >
                <span className="noti__icon" style={{ background: COLOR[n.kind] + '22', color: COLOR[n.kind] }}>{ICON[n.kind]}</span>
                <div className="noti__body">
                  <div className="noti__title">{n.title}</div>
                  {n.body && <div className="noti__sub">{n.body}</div>}
                  <div className="noti__time">{timeAgo(n.createdAt)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
