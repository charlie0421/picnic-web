import {enUS, id, ja, ko, zhCN} from "date-fns/locale";
import { format } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

export interface RemainingTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

// 언어별 시간대 코드 매핑
export const TIMEZONE_CODES = {
  'Asia/Seoul': {
    ko: 'KST',
    en: 'KST',
    ja: 'KST', 
    zh: 'KST',
    id: 'KST'
  },
  'Asia/Tokyo': {
    ko: 'JST',
    en: 'JST', 
    ja: 'JST',
    zh: 'JST',
    id: 'JST'
  },
  'Asia/Shanghai': {
    ko: 'CST',
    en: 'CST',
    ja: 'CST', 
    zh: 'CST',
    id: 'CST'
  },
  'Asia/Jakarta': {
    ko: 'WIB',
    en: 'WIB',
    ja: 'WIB',
    zh: 'WIB', 
    id: 'WIB'
  },
  'America/New_York': {
    ko: 'EST',
    en: 'EST',
    ja: 'EST',
    zh: 'EST',
    id: 'EST'
  },
  'America/Los_Angeles': {
    ko: 'PST',
    en: 'PST', 
    ja: 'PST',
    zh: 'PST',
    id: 'PST'
  },
  'Europe/London': {
    ko: 'GMT',
    en: 'GMT',
    ja: 'GMT', 
    zh: 'GMT',
    id: 'GMT'
  }
} as const;

// 기본 시간대 코드 (매핑되지 않은 경우)
export const DEFAULT_TIMEZONE_CODES = {
  ko: 'UTC',
  en: 'UTC',
  ja: 'UTC',
  zh: 'UTC', 
  id: 'UTC'
} as const;

/**
 * 사용자의 현재 시간대를 감지합니다
 */
export function getUserTimeZone(): string {
  if (typeof window === 'undefined') {
    return 'UTC'; // 서버 사이드에서는 UTC 반환
  }
  
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.warn('시간대 감지 실패, UTC로 대체:', error);
    return 'UTC';
  }
}

/**
 * 시간대에 해당하는 코드를 반환합니다
 */
export function getTimeZoneCode(timeZone: string, language: string = 'ko'): string {
  const langKey = language as keyof typeof DEFAULT_TIMEZONE_CODES;
  
  // 매핑된 시간대인지 확인
  if (timeZone in TIMEZONE_CODES) {
    const tzKey = timeZone as keyof typeof TIMEZONE_CODES;
    return TIMEZONE_CODES[tzKey][langKey] || TIMEZONE_CODES[tzKey].ko;
  }
  
  // 매핑되지 않은 경우 기본값 반환
  return DEFAULT_TIMEZONE_CODES[langKey] || DEFAULT_TIMEZONE_CODES.ko;
}

/**
 * UTC 시간을 사용자 시간대로 변환하여 포맷팅합니다 (시간대 코드 포함 여부 선택 가능)
 */
export function formatDateWithTimeZone(
  utcDate: string | Date,
  formatString: string = 'yyyy년 M월 d일 HH:mm',
  language: string = 'ko',
  timeZone?: string,
  includeTimeZoneCode: boolean = true
): string {
  const userTimeZone = timeZone || getUserTimeZone();
  const locale = getCurrentLocale(language);
  
  try {
    // UTC 날짜를 사용자 시간대로 변환
    const zonedDate = toZonedTime(new Date(utcDate), userTimeZone);
    
    // 포맷팅
    const formattedDate = format(zonedDate, formatString, { locale });
    
    // 시간대 코드 추가 여부 결정
    if (includeTimeZoneCode) {
      const tzCode = getTimeZoneCode(userTimeZone, language);
      return `${formattedDate} ${tzCode}`;
    }
    
    return formattedDate;
  } catch (error) {
    console.warn('날짜 포맷팅 실패:', error);
    // 폴백: 기본 Date 객체 사용
    const date = new Date(utcDate);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }
}

/**
 * 투표 기간을 포맷팅합니다 (시간대 코드는 마지막에만 표시)
 */
export function formatVotePeriodWithTimeZone(
  startDate: string | Date,
  endDate: string | Date, 
  language: string = 'ko',
  timeZone?: string
): string {
  const userTimeZone = timeZone || getUserTimeZone();
  
  // 언어별 포맷 설정
  const formatMap = {
    ko: 'yyyy年M월 d일 HH:mm',
    en: 'MMM d, yyyy HH:mm',
    ja: 'yyyy年M月d日 HH:mm', 
    zh: 'yyyy年M月d日 HH:mm',
    id: 'dd MMM yyyy HH:mm'
  };
  
  const formatString = formatMap[language as keyof typeof formatMap] || formatMap.ko;
  
  try {
    // 시작 날짜: 시간대 코드 없이 포맷팅
    const startFormatted = formatDateWithTimeZone(startDate, formatString, language, userTimeZone, false);
    // 종료 날짜: 시간대 코드와 함께 포맷팅  
    const endFormatted = formatDateWithTimeZone(endDate, formatString, language, userTimeZone, true);
    
    return `${startFormatted} ~ ${endFormatted}`;
  } catch (error) {
    console.warn('투표 기간 포맷팅 실패:', error);
    return '날짜 정보 오류';
  }
}

/**
 * 간단한 날짜 포맷팅 (시간대 코드 포함)
 */
export function formatSimpleDateWithTimeZone(
  date: string | Date,
  language: string = 'ko',
  timeZone?: string,
  includeTimeZoneCode: boolean = true
): string {
  const userTimeZone = timeZone || getUserTimeZone();
  
  const formatMap = {
    ko: 'M월 d일 HH:mm',
    en: 'MMM d HH:mm', 
    ja: 'M月d日 HH:mm',
    zh: 'M月d日 HH:mm',
    id: 'dd MMM HH:mm'
  };
  
  const formatString = formatMap[language as keyof typeof formatMap] || formatMap.ko;
  
  return formatDateWithTimeZone(date, formatString, language, userTimeZone, includeTimeZoneCode);
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
