import { useState, useEffect, useCallback } from 'react';
import type { SensorType, ChartDataPoint } from '../types/farm';
import { fetchSensorChartData } from './chartData';

interface UseSensorChartReturn {
  data: ChartDataPoint[];
  isLoading: boolean;
  refresh: () => void;
}

export function useSensorChart(sensorType: SensorType, hours = 24): UseSensorChartReturn {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const d = await fetchSensorChartData(sensorType, hours);
    setData(d);
    setIsLoading(false);
  }, [sensorType, hours]);

  useEffect(() => { load(); }, [load]);

  return { data, isLoading, refresh: load };
}

interface UseCorrelatedReturn {
  primaryData: ChartDataPoint[];
  secondaryData: ChartDataPoint[];
  isLoading: boolean;
  refresh: () => void;
}

export function useCorrelatedChartData(
  primary: SensorType,
  secondary: SensorType,
  hours = 24,
): UseCorrelatedReturn {
  const [primaryData,   setPrimary]   = useState<ChartDataPoint[]>([]);
  const [secondaryData, setSecondary] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading]     = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [p, s] = await Promise.all([
      fetchSensorChartData(primary, hours),
      fetchSensorChartData(secondary, hours),
    ]);
    setPrimary(p);
    setSecondary(s);
    setIsLoading(false);
  }, [primary, secondary, hours]);

  useEffect(() => { load(); }, [load]);

  return { primaryData, secondaryData, isLoading, refresh: load };
}
