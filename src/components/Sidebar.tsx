import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Thermometer,
  Settings,
  ClipboardList,
  CheckSquare,
  Scissors,
  Truck,
  Users,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import './Sidebar.css';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

const menuItems: MenuItem[] = [
  { id: 'main',     label: '통합 대시보드', icon: <LayoutDashboard size={20} />, path: '/' },
  { id: 'monitor',  label: '환경 모니터링', icon: <Thermometer size={20} />,     path: '/monitor' },
  { id: 'control',  label: '장비 제어',     icon: <Settings size={20} />,        path: '/control' },
  { id: 'harvest',  label: '수확 관리',     icon: <Scissors size={20} />,        path: '/harvest' },
  { id: 'shipment', label: '출하 · 유통',   icon: <Truck size={20} />,           path: '/shipment' },
  { id: 'social',   label: '농장 스토리',   icon: <Users size={20} />,           path: '/social' },
  { id: 'logs',     label: '활동 로그',     icon: <ClipboardList size={20} />,   path: '/logs' },
  { id: 'todos',    label: '작업 관리',     icon: <CheckSquare size={20} />,     path: '/todos' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onMyPage: () => void;
  onSignOut: () => void;
}

export default function Sidebar({ collapsed, onToggle, onMyPage, onSignOut }: SidebarProps) {
  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      {/* 로고 */}
      <div className="sidebar__logo">
        {collapsed ? (
          <img src="/logo.png" alt="CoG" className="sidebar__logo-icon" />
        ) : (
          <img src="/coglogotop.png" alt="CoGLabs" className="sidebar__logo-img" />
        )}
      </div>

      {/* 메인 메뉴 */}
      <nav className="sidebar__nav">
        {menuItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
            }
          >
            <span className="sidebar__icon">{item.icon}</span>
            {!collapsed && <span className="sidebar__label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* 하단 메뉴 */}
      <div className="sidebar__bottom">
        <button className="sidebar__item" onClick={onMyPage}>
          <span className="sidebar__icon"><User size={20} /></span>
          {!collapsed && <span className="sidebar__label">마이페이지</span>}
        </button>

        <button className="sidebar__item sidebar__item--danger" onClick={onSignOut}>
          <span className="sidebar__icon"><LogOut size={20} /></span>
          {!collapsed && <span className="sidebar__label">로그아웃</span>}
        </button>

        <button className="sidebar__toggle" onClick={onToggle} aria-label="사이드바 토글">
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </aside>
  );
}
