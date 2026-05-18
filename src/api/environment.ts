import { apiClient } from './client';
import type { EnvironmentData, DeviceModeConfig } from '../types/farm';

export interface CurrentDataResponse extends EnvironmentData {
  equipment?: Record<string, string>;
  device_modes?: Record<string, DeviceModeConfig>;
  updatedAt?: string;
  timestamp?: number;
}

interface HistoryDataPoint {
  timestamp: number;
  timestamp_kst: string;
  value: number;
}

export interface HistoryResponse {
  sensorType: string;
  unit: string;
  count: number;
  data: HistoryDataPoint[];
}

export const environmentApi = {
  getCurrentData: () => apiClient.get<CurrentDataResponse>('/environment/current'),

  getHistory: (params: { sensorType?: string; hours?: number; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params.sensorType) q.append('type', params.sensorType);
    if (params.hours)      q.append('hours', String(params.hours));
    if (params.startDate)  q.append('startDate', params.startDate);
    if (params.endDate)    q.append('endDate', params.endDate);
    return apiClient.get<HistoryResponse>(`/environment/history?${q}`);
  },

  getYesterdayData: () => apiClient.get<EnvironmentData>('/environment/yesterday'),
};
