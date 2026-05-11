import { useMemo, useState } from 'react';
import { Sprout, Leaf, Flower2, Apple, Scissors, CalendarDays, Award, ImageIcon } from 'lucide-react';
import { useFarm } from '../contexts/FarmContext';
import type { Crop, GrowthStage, QualityGrade, HarvestRequest } from '../types/farm';
import './HarvestPage.css';

const STAGES: GrowthStage[] = ['발아', '생장', '개화', '결실', '수확가능'];
const STAGE_ICON: Record<GrowthStage, JSX.Element> = {
  발아:     <Sprout size={16} />,
  생장:     <Leaf size={16} />,
  개화:     <Flower2 size={16} />,
  결실:     <Apple size={16} />,
  수확가능: <Scissors size={16} />,
};
const STAGE_COLOR: Record<GrowthStage, string> = {
  발아: '#84CC16', 생장: '#22C55E', 개화: '#F472B6', 결실: '#F97316', 수확가능: '#EF4444',
};
const GRADE_COLOR: Record<QualityGrade, { bg: string; text: string }> = {
  S: { bg: '#FEF3C7', text: '#D97706' },
  A: { bg: '#DCFCE7', text: '#16A34A' },
  B: { bg: '#DBEAFE', text: '#2563EB' },
  C: { bg: '#F3F4F6', text: '#6B7280' },
};

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

function StageBar({ stage }: { stage: GrowthStage }) {
  const idx = STAGES.indexOf(stage);
  return (
    <div className="hv-stage-bar">
      {STAGES.map((s, i) => (
        <div key={s} className={`hv-stage-bar__step ${i <= idx ? 'is-on' : ''}`} style={i <= idx ? { background: STAGE_COLOR[s], color: '#fff' } : undefined}>
          {STAGE_ICON[s]}
          <span>{s}</span>
        </div>
      ))}
    </div>
  );
}

function CropCard({ crop, onRequest }: { crop: Crop; onRequest: (c: Crop) => void }) {
  const dday = daysBetween(crop.expectedHarvestAt, new Date().toISOString());
  const ddayLabel = dday === 0 ? 'D-Day' : dday > 0 ? `D-${dday}` : `D+${-dday}`;
  const canHarvest = crop.stage === '수확가능' || dday <= 0;
  return (
    <div className="hv-card">
      <div className="hv-card__head">
        <div>
          <div className="hv-card__title">{crop.name} <span className="hv-card__zone">{crop.zone}</span></div>
          <div className="hv-card__sub">{crop.variety} · 식재 {daysBetween(new Date().toISOString(), crop.plantedAt)}일 경과</div>
        </div>
        <span className="hv-card__dday" style={{ color: STAGE_COLOR[crop.stage] }}>{ddayLabel}</span>
      </div>
      <StageBar stage={crop.stage} />
      <div className="hv-card__progress"><div className="hv-card__progress-fill" style={{ width: `${crop.progress}%`, background: STAGE_COLOR[crop.stage] }} /></div>
      <div className="hv-card__meta">
        <div><span>예상 수확량</span><strong>{crop.expectedYieldKg.toFixed(1)} kg</strong></div>
        <div><span>예측 등급</span>
          <strong className="hv-grade" style={{ background: GRADE_COLOR[crop.predictedGrade].bg, color: GRADE_COLOR[crop.predictedGrade].text }}>
            <Award size={11} /> {crop.predictedGrade}
          </strong>
        </div>
        <div><span>수확 예정</span><strong>{new Date(crop.expectedHarvestAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</strong></div>
      </div>
      <button className={`hv-card__btn ${canHarvest ? 'is-ready' : ''}`} disabled={!canHarvest} onClick={() => onRequest(crop)}>
        <Scissors size={14} /> {canHarvest ? '수확 요청' : '아직 미성숙'}
      </button>
    </div>
  );
}

function RequestModal({ crop, onClose }: { crop: Crop; onClose: () => void }) {
  const { requestHarvest } = useFarm();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  return (
    <div className="hv-modal-mask" onClick={onClose}>
      <div className="hv-modal" onClick={e => e.stopPropagation()}>
        <h3>{crop.name} ({crop.zone}) 수확 요청</h3>
        <label>수확 희망일<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>요청 메모<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="예: 오전 8시 이전 수확 요망" /></label>
        <div className="hv-modal__btns">
          <button onClick={onClose} className="hv-btn-ghost">취소</button>
          <button onClick={() => { requestHarvest(crop.id, new Date(date).toISOString(), note); onClose(); }} className="hv-btn-primary">요청 보내기</button>
        </div>
      </div>
    </div>
  );
}

function CompleteModal({ request, onClose }: { request: HarvestRequest; onClose: () => void }) {
  const { completeHarvest } = useFarm();
  const [yieldKg, setYieldKg] = useState(10);
  const [grade, setGrade] = useState<QualityGrade>('A');
  return (
    <div className="hv-modal-mask" onClick={onClose}>
      <div className="hv-modal" onClick={e => e.stopPropagation()}>
        <h3>{request.cropName} 수확 결과 입력</h3>
        <label>수확량 (kg)<input type="number" step="0.1" value={yieldKg} onChange={e => setYieldKg(Number(e.target.value))} /></label>
        <label>품질 등급
          <div className="hv-grade-picker">
            {(['S','A','B','C'] as QualityGrade[]).map(g => (
              <button key={g} type="button" className={grade === g ? 'is-on' : ''}
                style={grade === g ? { background: GRADE_COLOR[g].bg, color: GRADE_COLOR[g].text, borderColor: GRADE_COLOR[g].text } : undefined}
                onClick={() => setGrade(g)}>{g}</button>
            ))}
          </div>
        </label>
        <div className="hv-modal__btns">
          <button onClick={onClose} className="hv-btn-ghost">취소</button>
          <button onClick={() => { completeHarvest(request.id, yieldKg, grade); onClose(); }} className="hv-btn-primary">수확 완료</button>
        </div>
      </div>
    </div>
  );
}

export default function HarvestPage() {
  const { crops, harvestRequests, harvestLogs } = useFarm();
  const [requestCrop, setRequestCrop] = useState<Crop | null>(null);
  const [completeReq, setCompleteReq] = useState<HarvestRequest | null>(null);

  const upcoming = useMemo(() => [...crops].sort((a, b) => new Date(a.expectedHarvestAt).getTime() - new Date(b.expectedHarvestAt).getTime()), [crops]);
  const totalKg = harvestLogs.reduce((s, l) => s + l.yieldKg, 0);
  const totalRevenue = harvestLogs.reduce((s, l) => s + l.yieldKg * (l.pricePerKg ?? 0), 0);

  return (
    <div className="hv-page">
      <div className="hv-summary">
        <div className="hv-summary__card"><span>재배 중</span><strong>{crops.length}</strong><em>품목</em></div>
        <div className="hv-summary__card"><span>수확 대기</span><strong>{crops.filter(c => c.stage === '수확가능').length}</strong><em>구획</em></div>
        <div className="hv-summary__card"><span>누적 수확</span><strong>{totalKg.toFixed(1)}</strong><em>kg</em></div>
        <div className="hv-summary__card"><span>누적 정산</span><strong>{(totalRevenue / 10000).toFixed(1)}</strong><em>만원</em></div>
      </div>

      <section className="hv-section">
        <h2><CalendarDays size={18} /> 수확 예측 캘린더</h2>
        <div className="hv-calendar">
          {upcoming.map(c => {
            const dday = daysBetween(c.expectedHarvestAt, new Date().toISOString());
            return (
              <div key={c.id} className="hv-cal-row">
                <div className="hv-cal-row__date">{new Date(c.expectedHarvestAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}</div>
                <div className="hv-cal-row__bar">
                  <div className="hv-cal-row__bar-fill" style={{ width: `${c.progress}%`, background: STAGE_COLOR[c.stage] }} />
                  <span className="hv-cal-row__label">{c.name} · {c.zone} · {c.stage}</span>
                </div>
                <div className="hv-cal-row__dday" style={{ color: dday <= 0 ? '#EF4444' : '#6B7280' }}>
                  {dday <= 0 ? '수확가능' : `D-${dday}`}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="hv-section">
        <h2><Sprout size={18} /> 재배 구획</h2>
        <div className="hv-crop-grid">
          {crops.map(c => <CropCard key={c.id} crop={c} onRequest={setRequestCrop} />)}
        </div>
      </section>

      {harvestRequests.length > 0 && (
        <section className="hv-section">
          <h2><Scissors size={18} /> 수확 요청</h2>
          <div className="hv-req-list">
            {harvestRequests.map(r => (
              <div key={r.id} className="hv-req">
                <div className="hv-req__main">
                  <strong>{r.cropName}</strong> <span className="hv-req__zone">{r.zone}</span>
                  <span className={`hv-req__status hv-req__status--${r.status}`}>{r.status}</span>
                </div>
                <div className="hv-req__sub">
                  희망일 {new Date(r.scheduledAt).toLocaleDateString('ko-KR')} · 요청 {new Date(r.requestedAt).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                  {r.note ? ` · ${r.note}` : ''}
                </div>
                {r.status === '요청됨' && (
                  <button className="hv-btn-primary hv-req__btn" onClick={() => setCompleteReq(r)}>수확 결과 입력</button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="hv-section">
        <h2><Award size={18} /> 수확 로그</h2>
        <div className="hv-log-table">
          <div className="hv-log-table__head">
            <span>일시</span><span>품목</span><span>구획</span><span>수확량</span><span>등급</span><span>단가</span><span>금액</span>
          </div>
          {harvestLogs.map(l => (
            <div key={l.id} className="hv-log-table__row">
              <span>{new Date(l.harvestedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</span>
              <span>{l.cropName}</span>
              <span>{l.zone}</span>
              <span>{l.yieldKg.toFixed(1)} kg</span>
              <span><em className="hv-grade" style={{ background: GRADE_COLOR[l.grade].bg, color: GRADE_COLOR[l.grade].text }}>{l.grade}</em></span>
              <span>{l.pricePerKg ? `${l.pricePerKg.toLocaleString()}원` : '-'}</span>
              <span>{l.pricePerKg ? `${(l.yieldKg * l.pricePerKg).toLocaleString()}원` : '-'}</span>
            </div>
          ))}
          {harvestLogs.length === 0 && (
            <div className="hv-empty"><ImageIcon size={20} /> 아직 수확 기록이 없습니다.</div>
          )}
        </div>
      </section>

      {requestCrop && <RequestModal crop={requestCrop} onClose={() => setRequestCrop(null)} />}
      {completeReq && <CompleteModal request={completeReq} onClose={() => setCompleteReq(null)} />}
    </div>
  );
}
