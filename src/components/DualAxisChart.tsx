import { useMemo } from 'react';
import type { ChartDataPoint } from '../types/farm';
import './DualAxisChart.css';

interface Props {
  primaryData: ChartDataPoint[];
  secondaryData: ChartDataPoint[];
  primaryLabel: string;
  secondaryLabel: string;
  primaryColor: string;
  secondaryColor: string;
  primaryUnit: string;
  secondaryUnit: string;
  width?: number;
  height?: number;
}

const PAD = { top: 28, right: 52, bottom: 46, left: 52 };
const TENSION = 0.25;

function catmullRom(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) * TENSION;
    const cp1y = p1.y + (p2.y - p0.y) * TENSION;
    const cp2x = p2.x - (p3.x - p1.x) * TENSION;
    const cp2y = p2.y - (p3.y - p1.y) * TENSION;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

function buildPoints(
  data: ChartDataPoint[],
  min: number, max: number,
  cw: number, ch: number,
): { x: number; y: number; value: number }[] {
  return data.map((d, i) => ({
    x: PAD.left + (i / Math.max(data.length - 1, 1)) * cw,
    y: PAD.top  + ch - ((d.value - min) / (max - min)) * ch,
    value: d.value,
  }));
}

function yRange(data: ChartDataPoint[]) {
  const vals = data.map(d => d.value);
  let mn = Math.min(...vals), mx = Math.max(...vals);
  const r = mx - mn || 1;
  return { min: mn - r * 0.1, max: mx + r * 0.1 };
}

function yLabels(min: number, max: number, n: number, cy: number) {
  return Array.from({ length: n }, (_, i) => ({
    v: (min + ((max - min) * i) / (n - 1)).toFixed(1),
    y: PAD.top + cy - (i / (n - 1)) * cy,
  }));
}

export default function DualAxisChart({
  primaryData, secondaryData,
  primaryLabel, secondaryLabel,
  primaryColor, secondaryColor,
  primaryUnit, secondaryUnit,
  width = 340, height = 120,
}: Props) {
  const cw = width  - PAD.left  - PAD.right;
  const ch = height - PAD.top   - PAD.bottom;

  const computed = useMemo(() => {
    if (!primaryData.length && !secondaryData.length) return null;

    const pr = primaryData.length   ? yRange(primaryData)   : { min: 0, max: 1 };
    const sr = secondaryData.length ? yRange(secondaryData) : { min: 0, max: 1 };

    const pPts = buildPoints(primaryData,   pr.min, pr.max, cw, ch);
    const sPts = buildPoints(secondaryData, sr.min, sr.max, cw, ch);

    const xStep = Math.max(1, Math.floor(primaryData.length / 6));
    const xLabels = primaryData
      .filter((_, i) => i % xStep === 0 || i === primaryData.length - 1)
      .map(d => ({ label: d.time, x: PAD.left + (primaryData.indexOf(d) / Math.max(primaryData.length - 1, 1)) * cw }));

    return {
      pPath: catmullRom(pPts), sPat: catmullRom(sPts),
      pPts, sPts,
      pLabels: yLabels(pr.min, pr.max, 5, ch),
      sLabels: yLabels(sr.min, sr.max, 5, ch),
      xLabels,
    };
  }, [primaryData, secondaryData, cw, ch]);

  if (!computed) {
    return <div className="dualchart dualchart--empty" style={{ width, height }}>데이터 없음</div>;
  }

  const { pPath, sPat, pPts, sPts, pLabels, sLabels, xLabels } = computed;

  return (
    <div className="dualchart">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }} overflow="visible">
        {/* 가로 그리드 */}
        {pLabels.map((l, i) => (
          <line key={i} x1={PAD.left} x2={PAD.left + cw} y1={l.y} y2={l.y}
            stroke="#F3F4F6" strokeWidth={1} />
        ))}

        {/* 좌측 Y축 라벨 (primary) */}
        {pLabels.map((l, i) => (
          <text key={i} x={PAD.left - 6} y={l.y} textAnchor="end" dominantBaseline="middle"
            fontSize={9} fill={primaryColor}>
            {l.v}
          </text>
        ))}
        {/* 우측 Y축 라벨 (secondary) */}
        {sLabels.map((l, i) => (
          <text key={i} x={PAD.left + cw + 6} y={l.y} textAnchor="start" dominantBaseline="middle"
            fontSize={9} fill={secondaryColor}>
            {l.v}
          </text>
        ))}

        {/* X축 라벨 */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={PAD.top + ch + 14} textAnchor="middle"
            fontSize={9} fill="#9CA3AF">
            {l.label}
          </text>
        ))}

        {/* 선 */}
        {pPath && <path d={pPath} fill="none" stroke={primaryColor}   strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
        {sPat  && <path d={sPat}  fill="none" stroke={secondaryColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" />}

        {/* 점 (마지막만) */}
        {pPts.length > 0 && (
          <circle cx={pPts[pPts.length - 1].x} cy={pPts[pPts.length - 1].y} r={3}
            fill={primaryColor} />
        )}
        {sPts.length > 0 && (
          <circle cx={sPts[sPts.length - 1].x} cy={sPts[sPts.length - 1].y} r={3}
            fill={secondaryColor} />
        )}

        {/* 범례 */}
        <g transform={`translate(${PAD.left}, ${PAD.top + ch + 30})`}>
          <rect x={0} y={-4} width={14} height={3} fill={primaryColor} rx={1} />
          <text x={18} y={0} fontSize={9} fill="#6B7280">{primaryLabel}{primaryUnit ? ` (${primaryUnit})` : ''}</text>
          <line x1={80} y1={-2} x2={94} y2={-2} stroke={secondaryColor} strokeWidth={2} strokeDasharray="4 3" />
          <text x={98} y={0} fontSize={9} fill="#6B7280">{secondaryLabel}{secondaryUnit ? ` (${secondaryUnit})` : ''}</text>
        </g>
      </svg>
    </div>
  );
}
