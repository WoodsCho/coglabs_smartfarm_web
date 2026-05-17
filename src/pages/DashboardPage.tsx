import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import FarmModel3D from '../components/FarmModel3D';
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

const WELCOME_MODAL_KEY = 'dash_welcome_shown_v1';

type ModalView = 'main' | 'extend' | 'addPlant';

const EXTEND_OPTIONS = [
  { label: '+1개월', months: 1 },
  { label: '+2개월', months: 2 },
  { label: '+3개월', months: 3 },
  { label: '직접 입력', months: 0 },
];

const PLANT_OPTIONS = ['바질', '상추', '청경채', '루꼴라', '케일', '시금치', '허브 믹스'];

function WelcomeModal({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<ModalView>('main');
  const [toast, setToast] = useState(false);

  // 구독기간 연장 상태
  const [selectedMonths, setSelectedMonths] = useState<number | null>(null);
  const [customDate, setCustomDate] = useState('');

  // 식물 추가 상태
  const [plantName, setPlantName] = useState('');
  const [plantQty, setPlantQty] = useState('');
  const [plantDate, setPlantDate] = useState('');

  const showToast = () => { setToast(true); setTimeout(() => setToast(false), 2400); };

  const handleExtendSubmit = () => {
    showToast();
    setTimeout(() => setView('main'), 2400);
  };

  const handleAddPlantSubmit = () => {
    showToast();
    setTimeout(() => setView('main'), 2400);
  };

  const canSubmitExtend = selectedMonths !== null && (selectedMonths > 0 || customDate.length > 0);
  const canSubmitPlant = plantName.length > 0 && plantQty.length > 0;

  const titles: Record<ModalView, string> = {
    main: '🌿 구독 정보 / 온실 스펙',
    extend: '📅 구독기간 연장',
    addPlant: '🌱 식물 추가',
  };

  return (
    <div className="dash-modal__backdrop" onClick={onClose}>
      <div className="dash-modal__box" onClick={e => e.stopPropagation()}>
        {toast && <div className="dash-modal__toast">🛠️ 업데이트 예정 기능입니다</div>}

        <div className="dash-modal__header">
          {view !== 'main' && (
            <button className="dash-modal__back" onClick={() => setView('main')} aria-label="뒤로">‹</button>
          )}
          <span className="dash-modal__title">{titles[view]}</span>
          <button className="dash-modal__close" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>

        {/* ─── 메인 뷰 ─────────────────────────────────── */}
        {view === 'main' && (
          <>
            <div className="dash-modal__body">
              <div className="dash-modal__section">
                <div className="dash-modal__section-title">구독 정보</div>
                <div className="dash-modal__row">
                  <span className="dash-modal__key">구독 기간</span>
                  <span className="dash-modal__val">2026. 5. 14 ~ 2026. 7. 14</span>
                </div>
                <div className="dash-modal__row">
                  <span className="dash-modal__key">계약 식물</span>
                  <span className="dash-modal__val dash-modal__val--highlight">바질 214모종</span>
                </div>
                <div className="dash-modal__row">
                  <span className="dash-modal__key">정식 예정일</span>
                  <span className="dash-modal__val">2026. 5. 20</span>
                </div>
                <div className="dash-modal__action-row">
                  <button className="dash-modal__action-btn" onClick={() => setView('extend')}>📅 구독기간 연장</button>
                  <button className="dash-modal__action-btn" onClick={() => setView('addPlant')}>🌱 식물 추가</button>
                </div>
              </div>

              <div className="dash-modal__divider" />

              <div className="dash-modal__section">
                <div className="dash-modal__section-title">온실 스펙</div>
                <div className="dash-modal__row">
                  <span className="dash-modal__key">주소</span>
                  <span className="dash-modal__val" style={{fontSize:'12px'}}>전라남도 장성군 대악길 19-11</span>
                </div>
                <div className="dash-modal__row">
                  <span className="dash-modal__key">면적</span>
                  <span className="dash-modal__val">2.5평</span>
                </div>
                <div className="dash-modal__row">
                  <span className="dash-modal__key">모종 수</span>
                  <span className="dash-modal__val">324 모종</span>
                </div>
              </div>

              <div className="dash-modal__divider" />

              <div className="dash-modal__section">
                <div className="dash-modal__section-title">히트펌프</div>
                <div className="dash-modal__row">
                  <span className="dash-modal__key">용량</span>
                  <span className="dash-modal__val">1 PS</span>
                </div>
                <div className="dash-modal__row">
                  <span className="dash-modal__key">사용 수온</span>
                  <span className="dash-modal__val">7 ~ 25 °C</span>
                </div>
                <div className="dash-modal__chips">
                  <div className="dash-modal__chip dash-modal__chip--heating">
                    <span className="dash-modal__chip-label">난방</span>
                    <span className="dash-modal__chip-val">2,600 kcal/h</span>
                    <span className="dash-modal__chip-power">1.2 kW</span>
                  </div>
                  <div className="dash-modal__chip dash-modal__chip--cooling">
                    <span className="dash-modal__chip-label">냉방</span>
                    <span className="dash-modal__chip-val">2,400 kcal/h</span>
                    <span className="dash-modal__chip-power">1.3 kW</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="dash-modal__footer">
              <label className="dash-modal__no-show">
                <input type="checkbox" onChange={e => { if (e.target.checked) localStorage.setItem(WELCOME_MODAL_KEY, '1'); }} />
                다시 보지 않기
              </label>
              <button className="dash-modal__confirm" onClick={onClose}>확인</button>
            </div>
          </>
        )}

        {/* ─── 구독기간 연장 뷰 ────────────────────────── */}
        {view === 'extend' && (
          <>
            <div className="dash-modal__body">
              <div className="dash-modal__section">
                <div className="dash-modal__section-title">현재 구독 현황</div>
                <div className="dash-modal__row">
                  <span className="dash-modal__key">구독 기간</span>
                  <span className="dash-modal__val">2026. 5. 14 ~ 2026. 7. 14</span>
                </div>
                <div className="dash-modal__row">
                  <span className="dash-modal__key">남은 기간</span>
                  <span className="dash-modal__val dash-modal__val--highlight">58일</span>
                </div>
              </div>

              <div className="dash-modal__divider" />

              <div className="dash-modal__section">
                <div className="dash-modal__section-title">연장 기간 선택</div>
                <div className="dash-modal__option-grid">
                  {EXTEND_OPTIONS.map(opt => (
                    <button
                      key={opt.label}
                      className={`dash-modal__option-btn${selectedMonths === opt.months ? ' dash-modal__option-btn--active' : ''}`}
                      onClick={() => { setSelectedMonths(opt.months); if (opt.months > 0) setCustomDate(''); }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {selectedMonths === 0 && (
                  <div className="dash-modal__form-row">
                    <label className="dash-modal__label">만료일 직접 입력</label>
                    <input
                      className="dash-modal__input"
                      type="date"
                      value={customDate}
                      min="2026-07-15"
                      onChange={e => setCustomDate(e.target.value)}
                    />
                  </div>
                )}
                {selectedMonths !== null && selectedMonths > 0 && (
                  <div className="dash-modal__preview">
                    연장 후 만료일: <strong>
                      {(() => {
                        const d = new Date('2026-07-14');
                        d.setMonth(d.getMonth() + selectedMonths);
                        return `${d.getFullYear()}. ${d.getMonth()+1}. ${d.getDate()}`;
                      })()}
                    </strong>
                  </div>
                )}
              </div>
            </div>

            <div className="dash-modal__footer dash-modal__footer--single">
              <button
                className="dash-modal__confirm"
                disabled={!canSubmitExtend}
                onClick={handleExtendSubmit}
              >
                연장 신청하기
              </button>
            </div>
          </>
        )}

        {/* ─── 식물 추가 뷰 ────────────────────────────── */}
        {view === 'addPlant' && (
          <>
            <div className="dash-modal__body">
              <div className="dash-modal__section">
                <div className="dash-modal__section-title">현재 계약 식물</div>
                <div className="dash-modal__row">
                  <span className="dash-modal__key">바질</span>
                  <span className="dash-modal__val">214 모종</span>
                </div>
              </div>

              <div className="dash-modal__divider" />

              <div className="dash-modal__section">
                <div className="dash-modal__section-title">추가할 식물 정보</div>
                <div className="dash-modal__form-row">
                  <label className="dash-modal__label">식물 종류</label>
                  <select
                    className="dash-modal__input"
                    value={plantName}
                    onChange={e => setPlantName(e.target.value)}
                  >
                    <option value="">선택하세요</option>
                    {PLANT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="dash-modal__form-row">
                  <label className="dash-modal__label">모종 수량 (모종)</label>
                  <input
                    className="dash-modal__input"
                    type="number"
                    min="1"
                    placeholder="예: 100"
                    value={plantQty}
                    onChange={e => setPlantQty(e.target.value)}
                  />
                </div>
                <div className="dash-modal__form-row">
                  <label className="dash-modal__label">정식 예정일 (선택)</label>
                  <input
                    className="dash-modal__input"
                    type="date"
                    value={plantDate}
                    onChange={e => setPlantDate(e.target.value)}
                  />
                </div>
                {canSubmitPlant && (
                  <div className="dash-modal__preview">
                    추가 후 총 모종: <strong>{214 + (parseInt(plantQty) || 0)}모종</strong>
                    {plantDate && ` · 정식 예정 ${new Date(plantDate).toLocaleDateString('ko-KR')}`}
                  </div>
                )}
              </div>
            </div>

            <div className="dash-modal__footer dash-modal__footer--single">
              <button
                className="dash-modal__confirm"
                disabled={!canSubmitPlant}
                onClick={handleAddPlantSubmit}
              >
                추가 신청하기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { currentData, equipmentGroups } = useFarm();

  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem(WELCOME_MODAL_KEY)) setShowWelcome(true);
  }, []);
  const ledGroup = equipmentGroups.find(g => g.type === 'led');
  const ledStatus = (id: number) =>
    ledGroup?.equipment.find(e => e.id === id)?.status === 'ON';

  return (
    <div className="dash">
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}

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
