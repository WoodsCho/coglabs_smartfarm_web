import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { environmentApi } from '../api/environment';
import { controllerApi, REAL_DEVICE_MAP } from '../api/equipment';
import type {
  EnvironmentData, EquipmentGroup, Equipment,
  Crop, HarvestRequest, HarvestLog, Shipment, MarketPrice,
  StoryEvent, NeighborFarm, AppNotification, QualityGrade,
} from '../types/farm';

interface FarmContextType {
  currentData: EnvironmentData;
  equipmentGroups: EquipmentGroup[];
  toggleEquipmentStatus: (id: number, newStatus: string) => Promise<void>;
  toggleEquipmentAuto: (id: number, newAuto: boolean) => void;
  updateEquipmentTarget: (id: number, newTarget: number) => void;

  // 재배 · 수확
  crops: Crop[];
  harvestRequests: HarvestRequest[];
  harvestLogs: HarvestLog[];
  requestHarvest: (cropId: string, scheduledAt: string, note?: string) => void;
  completeHarvest: (requestId: string, yieldKg: number, grade: QualityGrade) => void;

  // 출하 · 유통 핸드오프
  shipments: Shipment[];
  marketPrices: MarketPrice[];
  reserveShipment: (harvestLogId: string, channel: string) => void;
  handoffShipment: (shipmentId: string) => void;

  // 소셜
  storyEvents: StoryEvent[];
  neighbors: NeighborFarm[];
  cheerNeighbor: (id: string) => void;
  addStoryEvent: (ev: Omit<StoryEvent, 'id' | 'occurredAt'> & { occurredAt?: string }) => void;

  // 알림
  notifications: AppNotification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
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
      { id: 1, name: 'LED 1', status: 'ON', auto: true, envValue: 80, target: 80, unit: '%', envName: '조도' },
      { id: 2, name: 'LED 2', status: 'ON', auto: true, envValue: 75, target: 80, unit: '%', envName: '조도' },
      { id: 3, name: 'LED 3', status: 'OFF', auto: false },
    ],
  },
  {
    type: 'fan', displayName: '환기팬', icon: 'sync', color: '#03a9f4',
    equipment: [
      { id: 4, name: '환기팬 1', status: 'RUNNING', auto: true, envValue: 24, target: 24, unit: '°C', envName: '온도' },
      { id: 5, name: '환기팬 2', status: 'RUNNING', auto: true, envValue: 23.5, target: 24, unit: '°C', envName: '온도' },
    ],
  },
  {
    type: 'pump', displayName: '양액', icon: 'water', color: '#4caf50',
    equipment: [
      { id: 6,  name: '양액 회수', status: 'OFF', auto: false },
      { id: 7,  name: '양액 공급', status: 'OFF', auto: false },
      { id: 13, name: '양액 A',   status: 'OFF', auto: false },
      { id: 12, name: '양액 B',   status: 'OFF', auto: false },
      { id: 11, name: 'Mixer',    status: 'OFF', auto: false },
    ],
  },
  {
    type: 'heater', displayName: '냉난방기', icon: 'flame', color: '#f44336',
    equipment: [
      { id: 8, name: '팬코일',   status: 'ON', auto: true },
      { id: 9, name: '히트펌프', status: 'ON', auto: true, envValue: 23.5, target: 24, unit: '°C', envName: '온도' },
    ],
  },
  {
    type: 'co2', displayName: 'CO2 공급', icon: 'cloud', color: '#9e9e9e',
    equipment: [
      { id: 10, name: 'CO2 발생기', status: 'ACTIVE', auto: true, envValue: 800, target: 1000, unit: 'ppm', envName: 'CO2' },
    ],
  },
];

const uid = () => Math.random().toString(36).slice(2, 10);
const isoDaysFromNow = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
const traceCode = () => 'COG-' + Math.random().toString(36).slice(2, 8).toUpperCase();

const DEFAULT_CROPS: Crop[] = [
  { id: 'c1', name: '로메인 상추', variety: 'Green Towers', zone: 'A-1', plantedAt: isoDaysFromNow(-32), expectedHarvestAt: isoDaysFromNow(3), stage: '결실',     progress: 88, expectedYieldKg: 12.4, predictedGrade: 'A' },
  { id: 'c2', name: '바질',       variety: 'Genovese',     zone: 'A-2', plantedAt: isoDaysFromNow(-18), expectedHarvestAt: isoDaysFromNow(9), stage: '개화',     progress: 64, expectedYieldKg: 5.8,  predictedGrade: 'S' },
  { id: 'c3', name: '청경채',     variety: 'Pak Choi',     zone: 'B-1', plantedAt: isoDaysFromNow(-40), expectedHarvestAt: isoDaysFromNow(-1), stage: '수확가능', progress: 100, expectedYieldKg: 9.2, predictedGrade: 'A' },
  { id: 'c4', name: '루꼴라',     variety: 'Wild',         zone: 'B-2', plantedAt: isoDaysFromNow(-7),  expectedHarvestAt: isoDaysFromNow(22), stage: '생장',     progress: 28, expectedYieldKg: 4.1,  predictedGrade: 'B' },
];

const DEFAULT_HARVEST_LOGS: HarvestLog[] = [
  { id: 'h1', cropName: '로메인 상추', zone: 'A-1', harvestedAt: isoDaysFromNow(-12), yieldKg: 11.6, grade: 'A', pricePerKg: 7200 },
  { id: 'h2', cropName: '바질',       zone: 'A-2', harvestedAt: isoDaysFromNow(-8),  yieldKg: 4.9,  grade: 'S', pricePerKg: 15400 },
  { id: 'h3', cropName: '청경채',     zone: 'B-1', harvestedAt: isoDaysFromNow(-3),  yieldKg: 8.7,  grade: 'B', pricePerKg: 4800 },
];

const DEFAULT_SHIPMENTS: Shipment[] = [
  { id: 's1', harvestLogIds: ['h1'], cropName: '로메인 상추', totalKg: 11.6, grade: 'A', storage: '저온창고', storageTempC: 2.5, storedUntil: isoDaysFromNow(2), status: '출하준비', channel: 'B2B 도매', traceCode: 'COG-A1R7K2' },
  { id: 's2', harvestLogIds: ['h2'], cropName: '바질',       totalKg: 4.9,  grade: 'S', storage: '저온창고', storageTempC: 4.0, storedUntil: isoDaysFromNow(5), status: '저장중',  channel: '로컬푸드',  traceCode: 'COG-B2N8M5' },
];

const DEFAULT_MARKET: MarketPrice[] = [
  { cropName: '로메인 상추', pricePerKg: 7400,  changePct:  3.2, market: '가락시장', updatedAt: new Date().toISOString() },
  { cropName: '바질',       pricePerKg: 15800, changePct:  1.4, market: '가락시장', updatedAt: new Date().toISOString() },
  { cropName: '청경채',     pricePerKg: 4600,  changePct: -2.1, market: '강서시장', updatedAt: new Date().toISOString() },
  { cropName: '루꼴라',     pricePerKg: 9200,  changePct:  5.6, market: '가락시장', updatedAt: new Date().toISOString() },
];

const DEFAULT_STORY: StoryEvent[] = [
  { id: 'e1', type: '식재',     cropId: 'c1', title: '로메인 상추 식재',       description: 'A-1 구획에 24주 식재', occurredAt: isoDaysFromNow(-32) },
  { id: 'e2', type: '단계전환', cropId: 'c1', title: '개화 단계 진입',         occurredAt: isoDaysFromNow(-12) },
  { id: 'e3', type: '경보',                  title: 'EC 일시 이탈',           description: '2.6 dS/m → 자동 보정 완료', occurredAt: isoDaysFromNow(-4) },
  { id: 'e4', type: '수확',     cropId: 'c1', title: '로메인 1차 수확 11.6kg', occurredAt: isoDaysFromNow(-12) },
  { id: 'e5', type: '단계전환', cropId: 'c2', title: '바질 개화 단계 진입',    occurredAt: isoDaysFromNow(-2) },
];

const DEFAULT_NEIGHBORS: NeighborFarm[] = [
  { id: 'n1', ownerName: '김현우', farmName: '햇살농원',     mainCrop: '딸기',     level: 12, cheers: 134, avatarColor: '#F97316', online: true  },
  { id: 'n2', ownerName: '이주은', farmName: '초록상자',     mainCrop: '바질',     level: 9,  cheers: 87,  avatarColor: '#10B981', online: true  },
  { id: 'n3', ownerName: '박민서', farmName: '도시농부101',  mainCrop: '청경채',   level: 7,  cheers: 52,  avatarColor: '#3B82F6', online: false },
  { id: 'n4', ownerName: '정유진', farmName: '루프탑팜',     mainCrop: '루꼴라',   level: 15, cheers: 211, avatarColor: '#8B5CF6', online: false },
];

const DEFAULT_NOTIFS: AppNotification[] = [
  { id: 'no1', kind: 'opportunity', title: '청경채 수확 가능',     body: 'B-1 구획이 수확 단계에 도달했습니다.',        createdAt: new Date(Date.now() - 1800000).toISOString(),  read: false, href: '/harvest' },
  { id: 'no2', kind: 'opportunity', title: '바질 시세 +1.4%',     body: '가락시장 15,800원/kg — 출하 검토 권장',       createdAt: new Date(Date.now() - 5400000).toISOString(),  read: false, href: '/shipment' },
  { id: 'no3', kind: 'risk',        title: 'EC 일시 이탈 감지',   body: 'A-2 구획 EC 2.6 → 자동 보정 완료',             createdAt: new Date(Date.now() - 14400000).toISOString(), read: true },
];


export function FarmProvider({ children }: { children: ReactNode }) {
  const [currentData, setCurrentData] = useState<EnvironmentData>(DEFAULT_ENV);
  const [equipmentGroups, setEquipmentGroups] = useState<EquipmentGroup[]>(DEFAULT_EQUIPMENT);

  const [crops, setCrops] = useState<Crop[]>(DEFAULT_CROPS);
  const [harvestRequests, setHarvestRequests] = useState<HarvestRequest[]>([]);
  const [harvestLogs, setHarvestLogs] = useState<HarvestLog[]>(DEFAULT_HARVEST_LOGS);
  const [shipments, setShipments] = useState<Shipment[]>(DEFAULT_SHIPMENTS);
  const [marketPrices] = useState<MarketPrice[]>(DEFAULT_MARKET);
  const [storyEvents, setStoryEvents] = useState<StoryEvent[]>(DEFAULT_STORY);
  const [neighbors, setNeighbors] = useState<NeighborFarm[]>(DEFAULT_NEIGHBORS);
  const [notifications, setNotifications] = useState<AppNotification[]>(DEFAULT_NOTIFS);

  // 초기 로드 시 REAL_DEVICE_MAP 기기 실제 상태를 controllerApi로 직접 조회
  useEffect(() => {
    Object.entries(REAL_DEVICE_MAP).forEach(async ([idStr, deviceId]) => {
      try {
        const result = await controllerApi.getStatus(deviceId);
        const equipmentId = Number(idStr);
        setEquipmentGroups(prev => prev.map(g => ({
          ...g,
          equipment: g.equipment.map(eq =>
            eq.id === equipmentId ? { ...eq, status: result.state as Equipment['status'] } : eq
          ),
        })));
      } catch { /* 조회 실패 시 기본값 유지 */ }
    });
  }, []);

  // 60초마다 최신 환경 데이터 + 장비 상태 폴링
  useEffect(() => {
    const poll = async () => {
      try {
        const apiData = await environmentApi.getCurrentData();
        setCurrentData(prev => ({
          ...prev,
          ...(apiData.temperature != null && { temperature: apiData.temperature }),
          ...(apiData.humidity != null && { humidity: apiData.humidity }),
          ...(apiData.waterTemp != null && { waterTemp: apiData.waterTemp }),
          ...(apiData.ph != null && { ph: apiData.ph }),
          ...(apiData.ec != null && { ec: apiData.ec }),
          ...(apiData.oxygenLevel != null && { oxygenLevel: apiData.oxygenLevel }),
          ...(apiData.heatPumpPower != null && { heatPumpPower: apiData.heatPumpPower }),
        }));
        if (apiData.equipment) {
          setEquipmentGroups(prev => prev.map(g => ({
            ...g,
            equipment: g.equipment.map(eq => {
              const deviceName = REAL_DEVICE_MAP[eq.id];
              if (!deviceName) return eq;
              const newStatus = apiData.equipment![deviceName];
              if (newStatus == null) return eq;
              return { ...eq, status: newStatus as Equipment['status'] };
            }),
          })));
        }
      } catch { /* 네트워크 오류 시 기존 값 유지 */ }
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => clearInterval(id);
  }, []);

  const toggleEquipmentStatus = async (equipmentId: number, newStatus: string): Promise<void> => {
    const deviceId = REAL_DEVICE_MAP[equipmentId];

    if (!deviceId) {
      // 실제 기기 없는 장비는 즉시 UI 업데이트
      setEquipmentGroups(prev => prev.map(g => ({
        ...g,
        equipment: g.equipment.map(eq =>
          eq.id === equipmentId ? { ...eq, status: newStatus as Equipment['status'] } : eq
        ),
      })));
      return;
    }

    const state = (['ON', 'ACTIVE', 'RUNNING'] as string[]).includes(newStatus) ? 'ON' : 'OFF';
    const result = await controllerApi.control(deviceId, state);
    setEquipmentGroups(prev => prev.map(g => ({
      ...g,
      equipment: g.equipment.map(eq =>
        eq.id === equipmentId ? { ...eq, status: result.state as Equipment['status'] } : eq
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

  /* ── 알림 ─────────────────────────── */
  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);
  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);
  const pushNotification = useCallback((n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => {
    setNotifications(prev => [{ ...n, id: uid(), createdAt: new Date().toISOString(), read: false }, ...prev]);
  }, []);

  /* ── 스토리 ─────────────────────────── */
  const addStoryEvent = useCallback<FarmContextType['addStoryEvent']>((ev) => {
    setStoryEvents(prev => [{
      id: uid(),
      occurredAt: ev.occurredAt ?? new Date().toISOString(),
      type: ev.type, title: ev.title, description: ev.description, cropId: ev.cropId, imageUrl: ev.imageUrl,
    }, ...prev]);
  }, []);

  /* ── 수확 요청 / 완료 ─────────────────────────── */
  const requestHarvest = useCallback((cropId: string, scheduledAt: string, note?: string) => {
    const crop = crops.find(c => c.id === cropId);
    if (!crop) return;
    const req: HarvestRequest = {
      id: uid(), cropId, cropName: crop.name, zone: crop.zone,
      requestedAt: new Date().toISOString(), scheduledAt, status: '요청됨', note,
    };
    setHarvestRequests(prev => [req, ...prev]);
    addStoryEvent({ type: '메모', cropId, title: `${crop.name} 수확 요청`, description: note });
    pushNotification({ kind: 'info', title: '수확 요청 접수', body: `${crop.name} (${crop.zone}) — 작업자에게 전달되었습니다.`, href: '/harvest' });
  }, [crops, addStoryEvent, pushNotification]);

  const completeHarvest = useCallback((requestId: string, yieldKg: number, grade: QualityGrade) => {
    const req = harvestRequests.find(r => r.id === requestId);
    if (!req) return;
    setHarvestRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: '완료' } : r));
    const market = DEFAULT_MARKET.find(m => m.cropName === req.cropName);
    const log: HarvestLog = {
      id: uid(), cropName: req.cropName, zone: req.zone,
      harvestedAt: new Date().toISOString(), yieldKg, grade,
      pricePerKg: market?.pricePerKg,
    };
    setHarvestLogs(prev => [log, ...prev]);
    setCrops(prev => prev.map(c => c.id === req.cropId ? { ...c, stage: '수확가능', progress: 100 } : c));
    addStoryEvent({ type: '수확', cropId: req.cropId, title: `${req.cropName} 수확 ${yieldKg}kg (${grade}등급)` });
    pushNotification({ kind: 'opportunity', title: '수확 완료', body: `${req.cropName} ${yieldKg}kg / ${grade}등급 — 출하 등록 가능`, href: '/shipment' });
  }, [harvestRequests, addStoryEvent, pushNotification]);

  /* ── 출하 ─────────────────────────── */
  const reserveShipment = useCallback((harvestLogId: string, channel: string) => {
    const log = harvestLogs.find(l => l.id === harvestLogId);
    if (!log) return;
    const sh: Shipment = {
      id: uid(), harvestLogIds: [log.id], cropName: log.cropName,
      totalKg: log.yieldKg, grade: log.grade, storage: '저온창고',
      storageTempC: 3, storedUntil: isoDaysFromNow(5), status: '저장중',
      channel, traceCode: traceCode(),
    };
    setShipments(prev => [sh, ...prev]);
    pushNotification({ kind: 'info', title: '출하 예약 등록', body: `${log.cropName} → ${channel}`, href: '/shipment' });
  }, [harvestLogs, pushNotification]);

  const handoffShipment = useCallback((shipmentId: string) => {
    setShipments(prev => prev.map(s => s.id === shipmentId ? { ...s, status: '핸드오프' } : s));
    pushNotification({ kind: 'info', title: '판매 플랫폼으로 전달', body: '유통 앱에서 거래를 이어서 진행해 주세요.' });
  }, [pushNotification]);

  /* ── 소셜 ─────────────────────────── */
  const cheerNeighbor = useCallback((id: string) => {
    setNeighbors(prev => prev.map(n => n.id === id ? { ...n, cheers: n.cheers + 1 } : n));
  }, []);


  return (
    <FarmContext.Provider value={{
      currentData, equipmentGroups,
      toggleEquipmentStatus, toggleEquipmentAuto, updateEquipmentTarget,
      crops, harvestRequests, harvestLogs,
      requestHarvest, completeHarvest,
      shipments, marketPrices, reserveShipment, handoffShipment,
      storyEvents, neighbors, cheerNeighbor, addStoryEvent,
      notifications, markNotificationRead, markAllNotificationsRead,
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
