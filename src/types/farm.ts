export interface EnvironmentData {
  temperature: number;
  humidity: number;
  co2: number;
  light: number;
  ph: number;
  ec: number;
  waterTemp: number;
  oxygenLevel: number;
  heatPumpPower?: number;
}

export interface Equipment {
  id: number;
  name: string;
  status: 'ON' | 'OFF' | 'ACTIVE' | 'RUNNING' | 'STANDBY' | 'MAINTENANCE';
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

/* ── 게이미피케이션: 재배 · 수확 ─────────────────────────────── */

export type GrowthStage = '발아' | '생장' | '개화' | '결실' | '수확가능';
export type QualityGrade = 'S' | 'A' | 'B' | 'C';

export interface Crop {
  id: string;
  name: string;          // 예: '로메인 상추'
  variety?: string;      // 품종
  zone: string;          // 임대 구획 (예: 'A-1')
  plantedAt: string;     // ISO date
  expectedHarvestAt: string;
  stage: GrowthStage;
  progress: number;      // 0~100
  expectedYieldKg: number;
  predictedGrade: QualityGrade;
  thumbnail?: string;
}

export type HarvestRequestStatus = '요청됨' | '진행중' | '완료' | '취소';

export interface HarvestRequest {
  id: string;
  cropId: string;
  cropName: string;
  zone: string;
  requestedAt: string;
  scheduledAt: string;
  status: HarvestRequestStatus;
  note?: string;
}

export interface HarvestLog {
  id: string;
  cropName: string;
  zone: string;
  harvestedAt: string;
  yieldKg: number;
  grade: QualityGrade;
  pricePerKg?: number;   // 정산 단가
  photo?: string;
}

/* ── 출하 · 유통 핸드오프 ─────────────────────────────── */

export type ShipmentStatus = '예약대기' | '저장중' | '출하준비' | '핸드오프';
export type StorageType = '저온창고' | '상온창고';

export interface Shipment {
  id: string;
  harvestLogIds: string[];
  cropName: string;
  totalKg: number;
  grade: QualityGrade;
  storage: StorageType;
  storageTempC: number;
  storedUntil: string;   // 권장 보관 마감
  status: ShipmentStatus;
  channel?: string;      // 'B2B 도매' | '로컬푸드' | '직거래' 등 (사용자 자체 플랫폼으로 핸드오프)
  traceCode: string;     // QR 트레이서빌리티 코드
}

export interface MarketPrice {
  cropName: string;
  pricePerKg: number;
  changePct: number;     // 전일 대비
  market: string;
  updatedAt: string;
}

/* ── 소셜 · 몰입 요소 ─────────────────────────────── */

export interface StoryEvent {
  id: string;
  cropId?: string;
  type: '식재' | '단계전환' | '경보' | '제어' | '수확' | '메모';
  title: string;
  description?: string;
  occurredAt: string;
  imageUrl?: string;
}

export interface NeighborFarm {
  id: string;
  ownerName: string;
  farmName: string;
  mainCrop: string;
  level: number;
  cheers: number;
  avatarColor: string;
  online: boolean;
}

export type NotificationKind = 'risk' | 'opportunity' | 'info';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  createdAt: string;
  read: boolean;
  href?: string;
}

