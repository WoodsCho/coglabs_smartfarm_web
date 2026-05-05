import type { SensorType, ChartDataPoint } from '../types/farm';

interface SensorRange { min: number; max: number; optimal: number; }

const SENSOR_RANGES: Record<SensorType, SensorRange> = {
  temperature: { min: 18, max: 30,   optimal: 23.5 },
  humidity:    { min: 50, max: 80,   optimal: 68 },
  co2:         { min: 400, max: 1500, optimal: 950 },
  light:       { min: 50, max: 100,  optimal: 80 },
  ph:          { min: 5.5, max: 6.8, optimal: 6.0 },
  ec:          { min: 1.5, max: 2.8, optimal: 2.1 },
  waterTemp:   { min: 18, max: 25,   optimal: 21.5 },
  oxygenLevel: { min: 6, max: 9,     optimal: 7.2 },
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

export function generateSensorData(sensorType: SensorType, count = 24, intervalMinutes = 10): ChartDataPoint[] {
  const range = SENSOR_RANGES[sensorType];
  const labels = generateTimeLabels(count, intervalMinutes);
  let base = range.optimal;

  return labels.map((time, i) => {
    const hour = Math.sin((i / count) * Math.PI * 2);
    const noise = (Math.random() - 0.5) * (range.max - range.min) * 0.1;
    let v = 0;
    switch (sensorType) {
      case 'temperature': v = hour * 3 + noise; break;
      case 'humidity':    v = -hour * 5 + noise; break;
      case 'co2':         v = -hour * 100 + noise * 5; break;
      case 'light':       v = Math.max(0, hour) * 40 + noise; break;
      case 'ph':          v = noise * 0.3; break;
      case 'ec':          v = noise * 0.1; break;
      case 'waterTemp':   v = hour * 1.5 + noise * 0.5; break;
      case 'oxygenLevel': v = -hour * 0.5 + noise * 0.2; break;
    }
    base = Math.max(range.min, Math.min(range.max, base + v));
    return { time, value: +base.toFixed(2), timestamp: Date.now() - (count - 1 - i) * intervalMinutes * 60_000 };
  });
}

// Real API sensors
const REAL_API_SENSORS = new Set<SensorType>(['temperature', 'humidity', 'waterTemp', 'ph', 'ec', 'oxygenLevel']);

import { environmentApi } from '../api/environment';

export async function fetchSensorChartData(sensorType: SensorType, hours: number): Promise<ChartDataPoint[]> {
  if (REAL_API_SENSORS.has(sensorType)) {
    try {
      const res = await environmentApi.getHistory({ sensorType, hours });
      return res.data.map(pt => ({
        timestamp: pt.timestamp,
        time: formatTime(pt.timestamp_kst, hours),
        value: pt.value,
      }));
    } catch { /* fallthrough to mock */ }
  }
  return generateSensorData(sensorType, hours, 60);
}
