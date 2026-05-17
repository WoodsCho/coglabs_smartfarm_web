import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import HarvestPage from './pages/HarvestPage';
import ShipmentPage from './pages/ShipmentPage';
import SocialPage from './pages/SocialPage';
import MonitorPage from './pages/MonitorPage';
import ControlPage from './pages/ControlPage';
import LogsPage from './pages/LogsPage';
import TodosPage from './pages/TodosPage';
import MobilePage from './pages/MobilePage';
import MobileLitePage from './pages/MobileLitePage';
import MyPage from './pages/MyPage';
import { FarmProvider } from './contexts/FarmContext';

function App() {
  return (
    <FarmProvider>
      <BrowserRouter>
        <Routes>
          {/* 모바일 앱 전용 — 레이아웃 없이 풀스크린 */}
          <Route path="/mobile" element={<MobilePage />} />
          <Route path="/mobile/lite" element={<MobileLitePage />} />

          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/monitor" element={<MonitorPage />} />
            <Route path="/control" element={<ControlPage />} />
            <Route path="/harvest" element={<HarvestPage />} />
            <Route path="/shipment" element={<ShipmentPage />} />
            <Route path="/social" element={<SocialPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/todos" element={<TodosPage />} />
            <Route path="/mypage" element={<MyPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </FarmProvider>
  );
}

export default App;
