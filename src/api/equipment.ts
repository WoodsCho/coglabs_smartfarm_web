import { apiClient } from './client';
import type { EquipmentGroup, Equipment } from '../types/farm';

export const REAL_DEVICE_MAP: Record<number, string> = {
  11: 'Mixer',
};

export const equipmentApi = {
  getGroups: () => apiClient.get<EquipmentGroup[]>('/equipment/groups'),

  controlDevice: (deviceId: string, state: 'ON' | 'OFF') =>
    apiClient.post<void>('/equipment/control', { deviceId, state }),

  control: (equipmentId: number, action: 'ON' | 'OFF' | 'TOGGLE', auto?: boolean) =>
    apiClient.put(`/equipment/${equipmentId}/control`, { action, auto }),

  toggleAuto: (equipmentId: number, auto: boolean) =>
    apiClient.put(`/equipment/${equipmentId}/auto`, { auto }),

  getStatus: (equipmentId: number) =>
    apiClient.get<Equipment>(`/equipment/${equipmentId}`),
};
