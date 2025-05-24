import {enUS, id, ja, ko, zhCN} from "date-fns/locale";

export interface RemainingTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function calculateRemainingTime(endTime: string): RemainingTime {
  // 클라이언트 사이드에서만 정확한 시간 계산
  const now = typeof window !== 'undefined' ? new Date().getTime() : Date.now();
  const end = new Date(endTime).getTime();
  const distance = Math.max(0, end - now);

  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((distance % (1000 * 60)) / 1000);

  return {
    days,
    hours,
    minutes,
    seconds,
  };
}

export const localeMap = {
  ko,
  ja,
  zh: zhCN,
  en: enUS,
  id: id,
};

export function getCurrentLocale(language: string) {
  return localeMap[language as keyof typeof localeMap] || enUS;
}
