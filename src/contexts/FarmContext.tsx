import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { environmentApi } from '../api/environment';
import { equipmentApi, REAL_DEVICE_MAP } from '../api/equipment';
import type { EnvironmentData, EquipmentGroup, Equipment } from '../types/farm';

interface FarmContextType {
  currentData: EnvironmentData;
  equipmentGroups: EquipmentGroup[];
  toggleEquipmentStatus: (id: number, newStatus: string) => void;
  toggleEquipmentAuto: (id: number, newAuto: boolean) => void;
  updateEquipmentTarget: (id: number, newTarget: number) => void;
}

const FarmContext = createContext<FarmContextType | undefined>(undefined);

const DEFAULT_ENV: EnvironmentData = {
  temperature: 23.5, humidity: 68, co2: 950, light: 80,
  ph: 6.0, ec: 2.1, waterTemp: 21.5, oxygenLevel: 7.2,
};

const DEFAULT_EQUIPMENT: EquipmentGroup[] = [
  {
    type: 'led', displayName: 'LED 조명', icon: 'bulb', color: '#ffc107',
    equipment: [
      { id: 1, name: 'LED 1', status: 'ON', auto: true,  envValue: 80, target: 80, unit: '%', envName: '조도' },
      { id: 2, name: 'LED 2', status: 'ON', auto: true,  envValue: 75, target: 80, unit: '%', envName: '조도' },
      { id: 3, name: 'LED 3', status: 'ON', auto: true,  envValue: 82, target: 80, unit: '%', envName: '조도' },
    ],
  },
  {
    type: 'fan', displayName: '환기팬', icon: 'sync', color: '#03a9f4',
    equipment: [
      { id: 4, name: '환기팬 1', status: 'RUNNING', auto: true, envValue: 24,   target: 24, unit: '°C', envName: '온도' },
      { id: 5, name: '환기팬 2', status: 'RUNNING', auto: true, envValue: 23.5, target: 24, unit: '°C', envName: '온도' },
    ],
  },
  {
    type: 'pump', displayName: '양액', icon: 'water', color: '#4caf50',
    equipment: [
      { id: 6,  name: '양액펌프 1', status: 'ACTIVE', auto: true, envValue: 2.1, target: 2.0, unit: 'dS/m', envName: 'EC',  lastOn: '10분 전', todayRuntime: '2시간 15분' },
      { id: 7,  name: '양액펌프 2', status: 'ACTIVE', auto: true, envValue: 6.0, target: 6.2, unit: '',     envName: 'pH', lastOn: '25분 전', todayRuntime: '1시간 50분' },
      { id: 11, name: 'Mixer',      status: 'ON',     auto: true },
    ],
  },
  {
    type: 'heater', displayName: '냉난방기', icon: 'flame', color: '#f44336',
    equipment: [
      { id: 8, name: '히터 1', status: 'ON', auto: true, envValue: 24,   target: 24, unit: '°C', envName: '온도' },
      { id: 9, name: '쿨러 1', status: 'ON', auto: true, envValue: 23.5, target: 24, unit: '°C', envName: '온도' },
    ],
  },
  {
    type: 'co2', displayName: 'CO2 공급', icon: 'cloud', color: '#9e9e9e',
    equipment: [
      { id: 10, name: 'CO2 발생기', status: 'ACTIVE', auto: true, envValue: 800, target: 1000, unit: 'ppm', envName: 'CO2' },
    ],
  },
];

export function FarmProvider({ children }: { children: ReactNode }) {
  const [currentData, setCurrentData] = useState<EnvironmentData>(DEFAULT_ENV);
  const [equipmentGroups, setEquipmentGroups] = useState<EquipmentGroup[]>(DEFAULT_EQUIPMENT);

  // 60초마다 최신 환경 데이터 폴링
  useEffect(() => {
    const fetch = async () => {
      try {
        const apiData = await environmentApi.getCurrentData();
        setCurrentData(prev => ({
          ...prev,
          ...(apiData.temperature  != null && { temperature:  apiData.temperature }),
          ...(apiData.humidity     != null && { humidity:     apiData.humidity }),
          ...(apiData.waterTemp    != null && { waterTemp:    apiData.waterTemp }),
          ...(apiData.ph           != null && { ph:           apiData.ph }),
          ...(apiData.ec           != null && { ec:           apiData.ec }),
          ...(apiData.oxygenLevel  != null && { oxygenLevel:  apiData.oxygenLevel }),
        }));
        if (apiData.equipment) {
          setEquipmentGroups(prev => prev.map(group => ({
            ...group,
            equipment: group.equipment.map(eq => {
              const deviceId = REAL_DEVICE_MAP[eq.id];
              if (deviceId && apiData.equipment![deviceId] != null) {
                return { ...eq, status: apiData.equipment![deviceId] as Equipment['status'] };
              }
              return eq;
            }),
          })));
        }
      } catch { /* 네트워크 오류 시 기존 값 유지 */ }
    };
    fetch();
    const id = setInterval(fetch, 60_000);
    return () => clearInterval(id);
  }, []);

  const toggleEquipmentStatus = (equipmentId: number, newStatus: string) => {
    const deviceId = REAL_DEVICE_MAP[equipmentId];
    if (deviceId) {
      const state = (['ON', 'ACTIVE', 'RUNNING'] as string[]).includes(newStatus) ? 'ON' : 'OFF';
      equipmentApi.controlDevice(deviceId, state).catch(console.error);
    }
    setEquipmentGroups(prev => prev.map(g => ({
      ...g,
      equipment: g.equipment.map(eq =>
        eq.id === equipmentId ? { ...eq, status: newStatus as Equipment['status'] } : eq
      ),
    })));
  };

  const toggleEquipmentAuto = (equipmentId: number, newAuto: boolean) => {
    setEquipmentGroups(prev => prev.map(g => ({
      ...g,
      equipment: g.equipment.map(eq => eq.id === equipmentId ? { ...eq, auto: newAuto } : eq),
    })));
  };

  const updateEquipmentTarget = (equipmentId: number, newTarget: number) => {
    setEquipmentGroups(prev => prev.map(g => ({
      ...g,
      equipment: g.equipment.map(eq => eq.id === equipmentId ? { ...eq, target: newTarget } : eq),
    })));
  };

  return (
    <FarmContext.Provider value={{
      currentData, equipmentGroups,
      toggleEquipmentStatus, toggleEquipmentAuto, updateEquipmentTarget,
    }}>
      {children}
    </FarmContext.Provider>
  );
}

export function useFarm() {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarm must be used within FarmProvider');
  return ctx;
}
