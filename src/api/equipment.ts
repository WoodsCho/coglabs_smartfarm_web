import { apiClient } from './client';
import type { EquipmentGroup, Equipment, AutoRule, DeviceModeConfig } from '../types/farm';

export const REAL_DEVICE_MAP: Record<number, string> = {
  1:  'solenoid_valve',
  2:  '0x70b3d52b6008b199',
  6:  '4th2_ch1',
  7:  '4th2_ch2',
  9:  'Heat-pump',
  11: 'Mixer',
  12: '4th2_ch109',
  13: '4th2_ch108',
};

const CONTROLLER_BASE = 'https://k8s-worker01.tail63c20e.ts.net';

const cFetch = (path: string, init?: RequestInit) =>
  fetch(`${CONTROLLER_BASE}${path}`, init).then(r => {
    if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${r.status}`);
    return r;
  });

export const controllerApi = {
  // ── 기존 ──────────────────────────────────────────────────
  control: (deviceId: string, state: 'ON' | 'OFF'): Promise<{ deviceId: string; state: string }> =>
    cFetch('/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, state }),
    }).then(r => r.json()),

  getStatus: (deviceId: string): Promise<{ deviceId: string; state: string }> =>
    cFetch(`/status/${deviceId}`).then(r => r.json()),

  // ── 모드 관리 ──────────────────────────────────────────────
  getConfig: (): Promise<Record<string, DeviceModeConfig>> =>
    cFetch('/config').then(r => r.json()),

  setMode: (deviceId: string, mode: 'auto' | 'manual'): Promise<{ equipment_id: string; mode: string }> =>
    cFetch(`/config/${deviceId}/mode`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }).then(r => r.json()),

  // ── 규칙 관리 ──────────────────────────────────────────────
  getRules: (deviceId: string): Promise<AutoRule[]> =>
    cFetch(`/rules/${deviceId}`).then(r => r.json()),

  createRule: (rule: Omit<AutoRule, 'rule_id'>): Promise<AutoRule> =>
    cFetch('/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    }).then(r => r.json()),

  deleteRule: (deviceId: string, ruleId: number): Promise<void> =>
    cFetch(`/rules/${deviceId}/${ruleId}`, { method: 'DELETE' }).then(() => undefined),
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
