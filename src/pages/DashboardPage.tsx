import { useMemo } from 'react';
import { Thermometer, Droplets, Wind, Sun, FlaskConical, Waves, Zap } from 'lucide-react';
import FarmModel3D from '../components/FarmModel3D';
import KPICard from '../components/KPICard';
import DualAxisChart from '../components/DualAxisChart';
import EquipmentSummary from '../components/EquipmentSummary';
import ActivityTimeline from '../components/ActivityTimeline';
import TaskPanel from '../components/TaskPanel';
import Chatbot from '../components/Chatbot';
import { useFarm } from '../contexts/FarmContext';
import { useCorrelatedChartData } from '../hooks/useSensorChartData';
import './DashboardPage.css';

function TemperatureHumidityChart() {
  const { primaryData, secondaryData, isLoading } = useCorrelatedChartData('temperature', 'humidity', 24);
  if (isLoading) return <div className="dash-chart-loading">로딩 중...</div>;
  return (
    <DualAxisChart
      primaryData={primaryData} secondaryData={secondaryData}
      primaryLabel="온도" secondaryLabel="습도"
      primaryColor="#EF4444" secondaryColor="#3B82F6"
      primaryUnit="°C" secondaryUnit="%"
    />
  );
}

function Co2OxygenChart() {
  const { primaryData, secondaryData, isLoading } = useCorrelatedChartData('co2', 'oxygenLevel', 24);
  if (isLoading) return <div className="dash-chart-loading">로딩 중...</div>;
  return (
    <DualAxisChart
      primaryData={primaryData} secondaryData={secondaryData}
      primaryLabel="CO₂" secondaryLabel="O₂"
      primaryColor="#10B981" secondaryColor="#06B6D4"
      primaryUnit="ppm" secondaryUnit="mg/L"
    />
  );
}

function WaterLightChart() {
  const { primaryData, secondaryData, isLoading } = useCorrelatedChartData('waterTemp', 'light', 24);
  if (isLoading) return <div className="dash-chart-loading">로딩 중...</div>;
  return (
    <DualAxisChart
      primaryData={primaryData} secondaryData={secondaryData}
      primaryLabel="수온" secondaryLabel="조도"
      primaryColor="#F97316" secondaryColor="#EAB308"
      primaryUnit="°C" secondaryUnit="%"
    />
  );
}

function PhEcChart() {
  const { primaryData, secondaryData, isLoading } = useCorrelatedChartData('ph', 'ec', 24);
  if (isLoading) return <div className="dash-chart-loading">로딩 중...</div>;
  return (
    <DualAxisChart
      primaryData={primaryData} secondaryData={secondaryData}
      primaryLabel="pH" secondaryLabel="EC"
      primaryColor="#8B5CF6" secondaryColor="#EC4899"
      primaryUnit="" secondaryUnit="dS/m"
    />
  );
}

export default function DashboardPage() {
  const { currentData, equipmentGroups } = useFarm();

  const ledGroup = equipmentGroups.find(g => g.type === 'led');
  const ledStatus = (id: number) =>
    ledGroup?.equipment.find(e => e.id === id)?.status === 'ON';

  const kpiCards = useMemo(() => [
    { title: '온도',     value: currentData.temperature, unit: '°C',   icon: <Thermometer size={18} />, color: '#EF4444' },
    { title: '습도',     value: currentData.humidity,    unit: '%',    icon: <Droplets     size={18} />, color: '#3B82F6' },
    { title: 'CO₂',     value: currentData.co2,          unit: 'ppm',  icon: <Wind         size={18} />, color: '#10B981' },
    { title: '조도',     value: currentData.light,        unit: '%',    icon: <Sun          size={18} />, color: '#EAB308' },
    { title: 'pH',      value: currentData.ph,           unit: '',     icon: <FlaskConical size={18} />, color: '#8B5CF6' },
    { title: 'EC',      value: currentData.ec,           unit: 'dS/m', icon: <Zap          size={18} />, color: '#EC4899' },
    { title: '수온',     value: currentData.waterTemp,    unit: '°C',   icon: <Waves        size={18} />, color: '#F97316' },
    { title: '용존산소', value: currentData.oxygenLevel,  unit: 'mg/L', icon: <Droplets     size={18} />, color: '#06B6D4' },
  ], [currentData]);

  return (
    <div className="dash">
      {/* KPI 행 */}
      <div className="dash__kpi-row">
        {kpiCards.map(card => (
          <KPICard key={card.title} {...card} value={card.value.toFixed(1)} />
        ))}
      </div>

      {/* 메인 3-컬럼 그리드 */}
      <div className="dash__grid">
        {/* 왼쪽: 3D + 차트 */}
        <div className="dash__col dash__col--left">
          <div className="dash-panel dash-panel--model">
            <FarmModel3D led1On={ledStatus(1)} led2On={ledStatus(2)} led3On={ledStatus(3)} sensorData={currentData} />
          </div>
          <div className="dash-chart-grid">
            <div className="dash-chart-card">
              <div className="dash-chart-card__title">온도 & 습도 추이</div>
              <TemperatureHumidityChart />
            </div>
            <div className="dash-chart-card">
              <div className="dash-chart-card__title">CO₂ & 용존산소</div>
              <Co2OxygenChart />
            </div>
            <div className="dash-chart-card">
              <div className="dash-chart-card__title">수온 & 조도</div>
              <WaterLightChart />
            </div>
            <div className="dash-chart-card">
              <div className="dash-chart-card__title">pH & EC</div>
              <PhEcChart />
            </div>
          </div>
        </div>

        {/* 가운데: 장비 제어 */}
        <div className="dash__col dash__col--mid">
          <EquipmentSummary />
        </div>

        {/* 오른쪽: 챗봇(위) + 작업관리/활동로그(아래 나란히) */}
        <div className="dash__col dash__col--right-area">
          <div className="dash__chat-panel">
            <Chatbot embedded />
          </div>
          <div className="dash__bottom-row">
            <div className="dash__bottom-col"><TaskPanel /></div>
            <div className="dash__bottom-col"><ActivityTimeline /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
