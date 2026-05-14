import { apiClient } from './client';
import type { EquipmentGroup, Equipment } from '../types/farm';

export const REAL_DEVICE_MAP: Record<number, string> = {
  1:  'solenoid_valve',
  2:  '0x70b3d52b6008b199',
  11: 'Mixer',
};

const CONTROLLER_BASE = 'https://k8s-worker01.tail63c20e.ts.net';

export const controllerApi = {
  control: (deviceId: string, state: 'ON' | 'OFF'): Promise<{ deviceId: string; state: string }> =>
    fetch(`${CONTROLLER_BASE}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, state }),
    }).then(r => r.json()),

  getStatus: (deviceId: string): Promise<{ deviceId: string; state: string }> =>
    fetch(`${CONTROLLER_BASE}/status/${deviceId}`).then(r => r.json()),
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
