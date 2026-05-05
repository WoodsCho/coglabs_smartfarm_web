export interface EnvironmentData {
  temperature: number;
  humidity: number;
  co2: number;
  light: number;
  ph: number;
  ec: number;
  waterTemp: number;
  oxygenLevel: number;
}

export interface Equipment {
  id: number;
  name: string;
  status: 'ON' | 'OFF' | 'ACTIVE' | 'RUNNING' | 'STANDBY';
  auto: boolean;
  envValue?: number;
  target?: number;
  unit?: string;
  envName?: string;
  lastOn?: string;
  todayRuntime?: string;
}

export interface EquipmentGroup {
  type: string;
  displayName: string;
  icon: string;
  color: string;
  equipment: Equipment[];
}

export type SensorType =
  | 'temperature'
  | 'humidity'
  | 'co2'
  | 'light'
  | 'ph'
  | 'ec'
  | 'waterTemp'
  | 'oxygenLevel';

export interface ChartDataPoint {
  time: string;
  value: number;
  timestamp?: number;
}
