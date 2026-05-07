import type { SensorType, ChartDataPoint } from '../types/farm';
import { environmentApi } from '../api/environment';

// 실제 API와 연결된 센서 (Tuya 기기에서 실데이터 수신)
const REAL_API_SENSORS = new Set<SensorType>([
  'temperature',
  'humidity',
  'waterTemp',
  'ph',
  'ec',
  'oxygenLevel',
]);

// 미연결 센서 (co2: modbus 예정, light: TBD) — 임시 시뮬레이션 데이터 사용
const UNCONNECTED_SENSOR_RANGES: Record<string, { min: number; max: number; optimal: number }> = {
  co2: { min: 400, max: 1500, optimal: 950 },
  light: { min: 50, max: 100, optimal: 80 },
};

function formatTime(kst: string, hours: number): string {
  return hours <= 24 ? kst.slice(11, 16) : kst.slice(5, 16);
}

function generateTimeLabels(count: number, intervalMinutes: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const t = new Date(now.getTime() - (count - 1 - i) * intervalMinutes * 60_000);
    return t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  });
}

/** co2 / light 전용 시뮬레이션 데이터 생성 (실데이터 없음) */
function generateUnconnectedData(sensorType: 'co2' | 'light', count: number, intervalMinutes: number): ChartDataPoint[] {
  const range = UNCONNECTED_SENSOR_RANGES[sensorType];
  const labels = generateTimeLabels(count, intervalMinutes);
  let base = range.optimal;

  return labels.map((time, i) => {
    const hour = Math.sin((i / count) * Math.PI * 2);
    const noise = (Math.random() - 0.5) * (range.max - range.min) * 0.1;
    const delta = sensorType === 'co2'
      ? -hour * 100 + noise * 5
      : Math.max(0, hour) * 40 + noise;
    base = Math.max(range.min, Math.min(range.max, base + delta));
    return { time, value: +base.toFixed(2), timestamp: Date.now() - (count - 1 - i) * intervalMinutes * 60_000 };
  });
}

export async function fetchSensorChartData(sensorType: SensorType, hours: number): Promise<ChartDataPoint[]> {
  // 실데이터 연결 센서: API 호출, 실패 시 빈 배열 반환 (mock 없음)
  if (REAL_API_SENSORS.has(sensorType)) {
    try {
      const res = await environmentApi.getHistory({ sensorType, hours });
      return res.data.map(pt => ({
        timestamp: pt.timestamp,
        time: formatTime(pt.timestamp_kst, hours),
        value: pt.value,
      }));
    } catch (err) {
      console.warn(`[chartData] ${sensorType} 히스토리 조회 실패:`, err);
      return [];
    }
  }

  // 미연결 센서 (co2, light): 시뮬레이션 데이터
  return generateUnconnectedData(sensorType as 'co2' | 'light', hours, 60);
}
