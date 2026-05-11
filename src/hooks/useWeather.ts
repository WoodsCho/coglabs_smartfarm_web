// 장성군 날씨 + 시간 기반 환경 정보 훅
// OpenWeatherMap API (무료) 사용
// API 키: https://openweathermap.org/api 에서 발급

const JANGSEONG_LAT = 35.3017;
const JANGSEONG_LON = 126.7847;
const _rawKey = import.meta.env.VITE_OPENWEATHER_API_KEY ?? '';
// 플레이스홀더 또는 빈 값이면 API 요청하지 않음
const API_KEY = (_rawKey && !_rawKey.includes('_') && _rawKey.length > 10) ? _rawKey : '';

export type WeatherCondition = 'clear' | 'clouds' | 'rain' | 'snow' | 'thunderstorm' | 'mist';

export interface WeatherState {
  condition: WeatherCondition;
  isDay: boolean;        // 현재 낮인지 밤인지
  sunProgress: number;   // 0~1: 일출=0, 정오=0.5, 일몰=1
  cloudiness: number;    // 0~1: 맑음=0, 완전흐림=1
  loading: boolean;
  error: string | null;
}

import { useEffect, useState } from 'react';

export function useWeather(): WeatherState {
  const [state, setState] = useState<WeatherState>({
    condition: 'clear',
    isDay: true,
    sunProgress: 0.5,
    cloudiness: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // API 키 없으면 현재 시각으로만 계산
    const calcFromTime = () => {
      const now = new Date();
      const hour = now.getHours() + now.getMinutes() / 60;
      // 장성군 일출 약 6시, 일몰 약 19시
      const sunrise = 6;
      const sunset = 19;
      const isDay = hour >= sunrise && hour < sunset;
      const sunProgress = isDay
        ? (hour - sunrise) / (sunset - sunrise)
        : 0;
      return { isDay, sunProgress };
    };

    if (!API_KEY) {
      const { isDay, sunProgress } = calcFromTime();
      setState({ condition: 'clear', isDay, sunProgress, cloudiness: 0, loading: false, error: null });
      return;
    }

    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${JANGSEONG_LAT}&lon=${JANGSEONG_LON}&appid=${API_KEY}&units=metric`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const now = Date.now() / 1000;
        const sunrise: number = data.sys.sunrise;
        const sunset: number = data.sys.sunset;
        const isDay = now >= sunrise && now < sunset;
        const sunProgress = isDay
          ? Math.max(0, Math.min(1, (now - sunrise) / (sunset - sunrise)))
          : 0;
        const cloudiness = (data.clouds?.all ?? 0) / 100;
        const weatherId: number = data.weather?.[0]?.id ?? 800;

        let condition: WeatherCondition = 'clear';
        if (weatherId >= 200 && weatherId < 300) condition = 'thunderstorm';
        else if (weatherId >= 300 && weatherId < 600) condition = 'rain';
        else if (weatherId >= 600 && weatherId < 700) condition = 'snow';
        else if (weatherId >= 700 && weatherId < 800) condition = 'mist';
        else if (weatherId >= 801) condition = 'clouds';

        setState({ condition, isDay, sunProgress, cloudiness, loading: false, error: null });
      } catch (e: any) {
        // API 실패 시 시간 기반 fallback
        const { isDay, sunProgress } = calcFromTime();
        setState({ condition: 'clear', isDay, sunProgress, cloudiness: 0, loading: false, error: e.message });
      }
    };

    fetchWeather();
    // 10분마다 갱신
    const interval = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return state;
}
