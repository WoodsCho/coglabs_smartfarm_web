import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import './Layout.css';

interface LayoutProps {
  username?: string;
}

export default function Layout({ username }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(true);
  const navigate = useNavigate();

  const handleSignOut = () => {
    // TODO: Amplify signOut 연결
    navigate('/login');
  };

  return (
    <div className="layout">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onMyPage={() => navigate('/mypage')}
        onSignOut={handleSignOut}
      />
      <div className="layout__body">
        <Header username={username} />
        <main className="layout__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
