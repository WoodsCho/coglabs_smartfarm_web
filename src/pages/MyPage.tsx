import { useState } from 'react';
import { User, CalendarDays, Leaf, Thermometer, Zap } from 'lucide-react';
import './MyPage.css';

const EXTEND_OPTIONS = [
  { label: '+1개월', months: 1 },
  { label: '+2개월', months: 2 },
  { label: '+3개월', months: 3 },
  { label: '직접 입력', months: 0 },
];

const PLANT_OPTIONS = ['바질', '상추', '청경채', '루꼴라', '케일', '시금치', '허브 믹스'];

function Toast({ msg }: { msg: string }) {
  return <div className="mypage-toast">{msg}</div>;
}

function SubscriptionCard() {
  const [toast, setToast] = useState(false);
  const showToast = () => { setToast(true); setTimeout(() => setToast(false), 2400); };

  // 구독기간 연장
  const [extendOpen, setExtendOpen] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<number | null>(null);
  const [customDate, setCustomDate] = useState('');

  const canSubmitExtend = selectedMonths !== null && (selectedMonths > 0 || customDate.length > 0);

  const handleExtendSubmit = () => { showToast(); setExtendOpen(false); setSelectedMonths(null); setCustomDate(''); };

  // 식물 추가
  const [addPlantOpen, setAddPlantOpen] = useState(false);
  const [plantName, setPlantName] = useState('');
  const [plantQty, setPlantQty] = useState('');
  const [plantDate, setPlantDate] = useState('');

  const canSubmitPlant = plantName.length > 0 && plantQty.length > 0;
  const handleAddPlantSubmit = () => { showToast(); setAddPlantOpen(false); setPlantName(''); setPlantQty(''); setPlantDate(''); };

  return (
    <div className="mypage-card">
      {toast && <Toast msg="🛠️ 업데이트 예정 기능입니다" />}

      <div className="mypage-card__header">
        <CalendarDays size={18} />
        <span>구독 정보</span>
      </div>

      <div className="mypage-card__body">
        <div className="mypage-info-grid">
          <div className="mypage-info-item">
            <span className="mypage-info-label">구독 기간</span>
            <span className="mypage-info-val">2026. 5. 14 ~ 2026. 7. 14</span>
          </div>
          <div className="mypage-info-item">
            <span className="mypage-info-label">남은 기간</span>
            <span className="mypage-info-val mypage-info-val--accent">58일</span>
          </div>
          <div className="mypage-info-item">
            <span className="mypage-info-label">계약 식물</span>
            <span className="mypage-info-val mypage-info-val--highlight">바질 214모종</span>
          </div>
          <div className="mypage-info-item">
            <span className="mypage-info-label">정식 예정일</span>
            <span className="mypage-info-val">2026. 5. 20</span>
          </div>
        </div>

        <div className="mypage-action-row">
          <button
            className={`mypage-action-btn${extendOpen ? ' mypage-action-btn--open' : ''}`}
            onClick={() => { setExtendOpen(v => !v); setAddPlantOpen(false); }}
          >
            📅 구독기간 연장
          </button>
          <button
            className={`mypage-action-btn${addPlantOpen ? ' mypage-action-btn--open' : ''}`}
            onClick={() => { setAddPlantOpen(v => !v); setExtendOpen(false); }}
          >
            🌱 식물 추가
          </button>
        </div>

        {/* 구독기간 연장 패널 */}
        {extendOpen && (
          <div className="mypage-sub-panel">
            <div className="mypage-sub-panel__title">연장 기간 선택</div>
            <div className="mypage-option-grid">
              {EXTEND_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  className={`mypage-option-btn${selectedMonths === opt.months ? ' mypage-option-btn--active' : ''}`}
                  onClick={() => { setSelectedMonths(opt.months); if (opt.months > 0) setCustomDate(''); }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {selectedMonths === 0 && (
              <div className="mypage-form-row">
                <label className="mypage-label">만료일 직접 입력</label>
                <input
                  className="mypage-input"
                  type="date"
                  value={customDate}
                  min="2026-07-15"
                  onChange={e => setCustomDate(e.target.value)}
                />
              </div>
            )}

            {selectedMonths !== null && selectedMonths > 0 && (
              <div className="mypage-preview">
                연장 후 만료일: <strong>
                  {(() => {
                    const d = new Date('2026-07-14');
                    d.setMonth(d.getMonth() + selectedMonths);
                    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
                  })()}
                </strong>
              </div>
            )}

            <button
              className="mypage-submit-btn"
              disabled={!canSubmitExtend}
              onClick={handleExtendSubmit}
            >
              연장 신청하기
            </button>
          </div>
        )}

        {/* 식물 추가 패널 */}
        {addPlantOpen && (
          <div className="mypage-sub-panel">
            <div className="mypage-sub-panel__title">추가할 식물 정보</div>

            <div className="mypage-form-row">
              <label className="mypage-label">식물 종류</label>
              <select
                className="mypage-input"
                value={plantName}
                onChange={e => setPlantName(e.target.value)}
              >
                <option value="">선택하세요</option>
                {PLANT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="mypage-form-row">
              <label className="mypage-label">모종 수량 (모종)</label>
              <input
                className="mypage-input"
                type="number"
                min="1"
                placeholder="예: 100"
                value={plantQty}
                onChange={e => setPlantQty(e.target.value)}
              />
            </div>

            <div className="mypage-form-row">
              <label className="mypage-label">정식 예정일 (선택)</label>
              <input
                className="mypage-input"
                type="date"
                value={plantDate}
                onChange={e => setPlantDate(e.target.value)}
              />
            </div>

            {canSubmitPlant && (
              <div className="mypage-preview">
                추가 후 총 모종: <strong>{214 + (parseInt(plantQty) || 0)}모종</strong>
                {plantDate && ` · 정식 예정 ${new Date(plantDate).toLocaleDateString('ko-KR')}`}
              </div>
            )}

            <button
              className="mypage-submit-btn"
              disabled={!canSubmitPlant}
              onClick={handleAddPlantSubmit}
            >
              추가 신청하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GreenhouseCard() {
  return (
    <div className="mypage-card">
      <div className="mypage-card__header">
        <Thermometer size={18} />
        <span>온실 스펙</span>
      </div>
      <div className="mypage-card__body">
        <div className="mypage-info-grid">
          <div className="mypage-info-item">
            <span className="mypage-info-label">면적</span>
            <span className="mypage-info-val">2.5평</span>
          </div>
          <div className="mypage-info-item">
            <span className="mypage-info-label">모종 수</span>
            <span className="mypage-info-val">324 모종</span>
          </div>
        </div>

        <div className="mypage-card__section-title"><Zap size={13} /> 히트펌프</div>
        <div className="mypage-info-grid">
          <div className="mypage-info-item">
            <span className="mypage-info-label">용량</span>
            <span className="mypage-info-val">1 PS</span>
          </div>
          <div className="mypage-info-item">
            <span className="mypage-info-label">사용 수온</span>
            <span className="mypage-info-val">7 ~ 25 °C</span>
          </div>
        </div>

        <div className="mypage-chips">
          <div className="mypage-chip mypage-chip--heating">
            <span className="mypage-chip-label">난방</span>
            <span className="mypage-chip-val">2,600 kcal/h</span>
            <span className="mypage-chip-power">1.2 kW</span>
          </div>
          <div className="mypage-chip mypage-chip--cooling">
            <span className="mypage-chip-label">냉방</span>
            <span className="mypage-chip-val">2,400 kcal/h</span>
            <span className="mypage-chip-power">1.3 kW</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountCard() {
  return (
    <div className="mypage-card">
      <div className="mypage-card__header">
        <User size={18} />
        <span>계정 정보</span>
      </div>
      <div className="mypage-card__body">
        <div className="mypage-info-grid">
          <div className="mypage-info-item">
            <span className="mypage-info-label">이름</span>
            <span className="mypage-info-val">관리자</span>
          </div>
          <div className="mypage-info-item">
            <span className="mypage-info-label">구독 플랜</span>
            <span className="mypage-info-val mypage-info-val--badge">스탠다드</span>
          </div>
          <div className="mypage-info-item">
            <span className="mypage-info-label">농장 이름</span>
            <span className="mypage-info-val">CogLabs 스마트팜</span>
          </div>
          <div className="mypage-info-item">
            <span className="mypage-info-label">위치</span>
            <span className="mypage-info-val">전남 장성군</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MyPage() {
  return (
    <div className="mypage">
      <div className="mypage__heading">
        <Leaf size={22} className="mypage__heading-icon" />
        <div>
          <h1 className="mypage__title">마이페이지</h1>
          <p className="mypage__subtitle">구독 현황과 온실 스펙을 확인하고 관리하세요.</p>
        </div>
      </div>

      <div className="mypage__grid">
        <AccountCard />
        <SubscriptionCard />
        <GreenhouseCard />
      </div>
    </div>
  );
}
