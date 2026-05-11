import { useMemo, useState } from 'react';
import { Package, Snowflake, QrCode, TrendingUp, TrendingDown, ExternalLink, Truck, ShoppingBag } from 'lucide-react';
import { useFarm } from '../contexts/FarmContext';
import type { HarvestLog, QualityGrade, Shipment } from '../types/farm';
import './ShipmentPage.css';

const CHANNELS = ['B2B 도매', '로컬푸드', '직거래', '식당 납품'] as const;

const GRADE_COLOR: Record<QualityGrade, { bg: string; text: string }> = {
  S: { bg: '#FEF3C7', text: '#D97706' },
  A: { bg: '#DCFCE7', text: '#16A34A' },
  B: { bg: '#DBEAFE', text: '#2563EB' },
  C: { bg: '#F3F4F6', text: '#6B7280' },
};
const STATUS_COLOR: Record<Shipment['status'], string> = {
  예약대기:  '#9CA3AF',
  저장중:    '#3B82F6',
  출하준비:  '#F59E0B',
  핸드오프:  '#10B981',
};

const qrUrl = (code: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent('cog://trace/' + code)}`;

function ReserveModal({ log, onClose }: { log: HarvestLog; onClose: () => void }) {
  const { reserveShipment } = useFarm();
  const [channel, setChannel] = useState<string>(CHANNELS[0]);
  return (
    <div className="sp-modal-mask" onClick={onClose}>
      <div className="sp-modal" onClick={e => e.stopPropagation()}>
        <h3>{log.cropName} 출하 예약</h3>
        <div className="sp-modal__row"><span>수확량</span><strong>{log.yieldKg.toFixed(1)} kg</strong></div>
        <div className="sp-modal__row"><span>등급</span><strong style={{ background: GRADE_COLOR[log.grade].bg, color: GRADE_COLOR[log.grade].text }} className="sp-grade-tag">{log.grade}</strong></div>
        <label>유통 채널 선택
          <div className="sp-channel-picker">
            {CHANNELS.map(c => (
              <button key={c} className={channel === c ? 'is-on' : ''} onClick={() => setChannel(c)}>{c}</button>
            ))}
          </div>
        </label>
        <p className="sp-modal__hint">예약 후 보관 정보와 추적 QR이 자동 발급됩니다. 실제 거래는 별도 판매 플랫폼에서 진행됩니다.</p>
        <div className="sp-modal__btns">
          <button onClick={onClose} className="sp-btn-ghost">취소</button>
          <button onClick={() => { reserveShipment(log.id, channel); onClose(); }} className="sp-btn-primary">예약 등록</button>
        </div>
      </div>
    </div>
  );
}

function TraceModal({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  return (
    <div className="sp-modal-mask" onClick={onClose}>
      <div className="sp-modal sp-modal--qr" onClick={e => e.stopPropagation()}>
        <h3>트레이서빌리티 QR</h3>
        <img src={qrUrl(shipment.traceCode)} alt={shipment.traceCode} width={160} height={160} />
        <code>{shipment.traceCode}</code>
        <div className="sp-trace-meta">
          <div><span>품목</span><strong>{shipment.cropName}</strong></div>
          <div><span>수량</span><strong>{shipment.totalKg.toFixed(1)} kg</strong></div>
          <div><span>등급</span><strong>{shipment.grade}</strong></div>
          <div><span>보관</span><strong>{shipment.storage} {shipment.storageTempC}°C</strong></div>
        </div>
        <p className="sp-modal__hint">구매자가 스캔하면 재배 환경, 양액, LED 이력 등 추적 정보를 확인할 수 있습니다.</p>
        <button onClick={onClose} className="sp-btn-primary">닫기</button>
      </div>
    </div>
  );
}

export default function ShipmentPage() {
  const { harvestLogs, shipments, marketPrices, handoffShipment } = useFarm();
  const [reserveLog, setReserveLog] = useState<HarvestLog | null>(null);
  const [traceShip, setTraceShip] = useState<Shipment | null>(null);

  const reservedLogIds = useMemo(() => new Set(shipments.flatMap(s => s.harvestLogIds)), [shipments]);
  const pendingLogs = harvestLogs.filter(l => !reservedLogIds.has(l.id));

  const totalKg = shipments.reduce((s, x) => s + x.totalKg, 0);
  const handoffCount = shipments.filter(s => s.status === '핸드오프').length;

  return (
    <div className="sp-page">
      <div className="sp-summary">
        <div className="sp-summary__card"><span>출하 예약</span><strong>{shipments.length}</strong><em>건</em></div>
        <div className="sp-summary__card"><span>보관 중 수량</span><strong>{totalKg.toFixed(1)}</strong><em>kg</em></div>
        <div className="sp-summary__card"><span>판매 플랫폼 전달</span><strong>{handoffCount}</strong><em>건</em></div>
        <div className="sp-summary__card"><span>대기 수확물</span><strong>{pendingLogs.length}</strong><em>건</em></div>
      </div>

      <section className="sp-section">
        <h2><TrendingUp size={18} /> 도매시장 시세</h2>
        <div className="sp-market">
          {marketPrices.map(m => {
            const up = m.changePct >= 0;
            return (
              <div key={m.cropName} className="sp-market__card">
                <div className="sp-market__head"><strong>{m.cropName}</strong><span>{m.market}</span></div>
                <div className="sp-market__price">{m.pricePerKg.toLocaleString()}<em>원/kg</em></div>
                <div className={`sp-market__chg ${up ? 'is-up' : 'is-down'}`}>
                  {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {up ? '+' : ''}{m.changePct.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {pendingLogs.length > 0 && (
        <section className="sp-section">
          <h2><Package size={18} /> 출하 대기 수확물</h2>
          <div className="sp-pending">
            {pendingLogs.map(l => (
              <div key={l.id} className="sp-pending__row">
                <div className="sp-pending__main">
                  <strong>{l.cropName}</strong>
                  <span className="sp-grade-tag" style={{ background: GRADE_COLOR[l.grade].bg, color: GRADE_COLOR[l.grade].text }}>{l.grade}</span>
                  <span className="sp-pending__meta">{l.yieldKg.toFixed(1)}kg · {l.zone} · {new Date(l.harvestedAt).toLocaleDateString('ko-KR')}</span>
                </div>
                <button className="sp-btn-primary" onClick={() => setReserveLog(l)}>
                  <Truck size={13} /> 출하 예약
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="sp-section">
        <h2><Snowflake size={18} /> 보관 · 출하 상태</h2>
        {shipments.length === 0 ? (
          <div className="sp-empty">아직 예약된 출하가 없습니다.</div>
        ) : (
          <div className="sp-ship-grid">
            {shipments.map(s => (
              <div key={s.id} className="sp-ship-card">
                <div className="sp-ship-card__head">
                  <strong>{s.cropName}</strong>
                  <span className="sp-grade-tag" style={{ background: GRADE_COLOR[s.grade].bg, color: GRADE_COLOR[s.grade].text }}>{s.grade}</span>
                  <span className="sp-status" style={{ background: STATUS_COLOR[s.status] + '20', color: STATUS_COLOR[s.status] }}>{s.status}</span>
                </div>
                <div className="sp-ship-card__meta">
                  <div><span>수량</span><strong>{s.totalKg.toFixed(1)} kg</strong></div>
                  <div><span>보관</span><strong>{s.storage} · {s.storageTempC}°C</strong></div>
                  <div><span>보관 마감</span><strong>{new Date(s.storedUntil).toLocaleDateString('ko-KR')}</strong></div>
                  <div><span>채널</span><strong>{s.channel ?? '-'}</strong></div>
                </div>
                <div className="sp-ship-card__btns">
                  <button className="sp-btn-ghost" onClick={() => setTraceShip(s)}>
                    <QrCode size={13} /> 추적 QR
                  </button>
                  {s.status !== '핸드오프' ? (
                    <button className="sp-btn-primary" onClick={() => handoffShipment(s.id)}>
                      <ShoppingBag size={13} /> 판매 플랫폼으로
                    </button>
                  ) : (
                    <button className="sp-btn-done" disabled>
                      <ExternalLink size={13} /> 전달 완료
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {reserveLog && <ReserveModal log={reserveLog} onClose={() => setReserveLog(null)} />}
      {traceShip && <TraceModal shipment={traceShip} onClose={() => setTraceShip(null)} />}
    </div>
  );
}
