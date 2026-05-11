import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import HarvestPage from './pages/HarvestPage';
import ShipmentPage from './pages/ShipmentPage';
import SocialPage from './pages/SocialPage';
import { FarmProvider } from './contexts/FarmContext';

function App() {
  return (
    <FarmProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/monitor"  element={<Placeholder title="환경 모니터링" />} />
            <Route path="/control"  element={<Placeholder title="장비 제어" />} />
            <Route path="/harvest"  element={<HarvestPage />} />
            <Route path="/shipment" element={<ShipmentPage />} />
            <Route path="/social"   element={<SocialPage />} />
            <Route path="/logs"     element={<Placeholder title="활동 로그" />} />
            <Route path="/todos"    element={<Placeholder title="작업 관리" />} />
            <Route path="/mypage"   element={<Placeholder title="마이페이지" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </FarmProvider>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: 32, color: '#6B7280', fontSize: 18 }}>
      {title} — 준비 중입니다.
    </div>
  );
}

export default App;
