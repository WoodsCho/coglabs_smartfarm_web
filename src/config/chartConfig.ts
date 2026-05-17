import type { ChartDataPoint } from '../types/farm';

export interface ChartSeriesConfig {
  label: string;
  color: string;
  unit: string;
}

export interface ChartGroupConfig {
  title: string;
  icon: string;
  primaryKey: string;
  secondaryKey: string;
  primary: ChartSeriesConfig;
  secondary: ChartSeriesConfig;
}

export const CHART_GROUP_CONFIG: ChartGroupConfig[] = [
  {
    title: '온도 & 습도 추이', icon: 'thermometer',
    primaryKey: 'temperature', secondaryKey: 'humidity',
    primary:   { label: '온도', color: '#EF4444', unit: '°C' },
    secondary: { label: '습도', color: '#3B82F6', unit: '%' },
  },
  {
    title: 'CO₂ & 용존산소', icon: 'cloud',
    primaryKey: 'co2', secondaryKey: 'oxygenLevel',
    primary:   { label: 'CO₂', color: '#10B981', unit: 'ppm' },
    secondary: { label: 'O₂',  color: '#06B6D4', unit: 'mg/L' },
  },
  {
    title: '수온 & 조도(3층)', icon: 'sun',
    primaryKey: 'waterTemp', secondaryKey: 'light1',
    primary:   { label: '수온', color: '#F97316', unit: '°C' },
    secondary: { label: '조도1', color: '#EAB308', unit: 'lux' },
  },
  {
    title: 'pH & EC (양액)', icon: 'flask',
    primaryKey: 'ph', secondaryKey: 'ec',
    primary:   { label: 'pH', color: '#8B5CF6', unit: '' },
    secondary: { label: 'EC', color: '#EC4899', unit: 'dS/m' },
  },
];

export interface ChartGroupWithData extends ChartGroupConfig {
  primaryData: ChartDataPoint[];
  secondaryData: ChartDataPoint[];
}

export function buildChartGroups(dataMap: Record<string, ChartDataPoint[]>): ChartGroupWithData[] {
  return CHART_GROUP_CONFIG.map(cfg => ({
    ...cfg,
    primaryData:   dataMap[cfg.primaryKey]   ?? [],
    secondaryData: dataMap[cfg.secondaryKey] ?? [],
  }));
}
