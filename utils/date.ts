import {enUS, id, ja, ko, zhCN, type Locale} from "date-fns/locale";
import { format } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { DateTime } from 'luxon';
import { TIMEZONE_ABBREVIATIONS } from './timezone-data';

export interface RemainingTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

// 타입 안전성을 위한 지원 언어 정의
export type SupportedLanguage = 'ko' | 'en' | 'ja' | 'zh' | 'id';

// 상수 분리로 성능 최적화
const LOCALE_MAP = {
  ko: 'ko-KR',
  ja: 'ja-JP', 
  zh: 'zh-CN',
  en: 'en-US',
  id: 'id-ID'
} as const;

const DATE_FNS_LOCALE_MAP = {
  ko,
  ja,
  zh: zhCN,
  en: enUS,
  id: id,
} as const;

const DATE_FORMAT_MAP = {
  ko: 'yyyy년 M월 d일 HH:mm',
  en: 'MMM d, yyyy HH:mm',
  ja: 'yyyy年M月d日 HH:mm', 
  zh: 'yyyy年M月d日 HH:mm',
  id: 'dd MMM yyyy HH:mm'
} as const;

const SIMPLE_DATE_FORMAT_MAP = {
  ko: 'M월 d일 HH:mm',
  en: 'MMM d HH:mm', 
  ja: 'M月d日 HH:mm',
  zh: 'M月d日 HH:mm',
  id: 'dd MMM HH:mm'
} as const;

// 캐싱을 위한 전역 변수들
let cachedUserTimeZone: string | null = null;
let lastTimeZoneCheck = 0;
const timeZoneCodeCache = new Map<string, string>();
const intlFormatterCache = new Map<string, Intl.DateTimeFormat>();

// 시간 상수
const TIMEZONE_CACHE_TTL = 60000; // 1분
const TIMEZONE_CHECK_DEBOUNCE = 100;
const TIMEZONE_WATCH_INTERVAL = 5 * 60 * 1000; // 5분

/**
 * 최적화된 사용자 시간대 감지 (캐싱 적용)
 */
export function getUserTimeZone(forceRefresh: boolean = false): string {
  if (typeof window === 'undefined') {
    return 'UTC';
  }
  
  const now = Date.now();
  
  // 캐시된 값이 있고, 강제 새로고침이 아니며, TTL 내에 있으면 캐시된 값 반환
  if (!forceRefresh && cachedUserTimeZone && (now - lastTimeZoneCheck) < TIMEZONE_CACHE_TTL) {
    return cachedUserTimeZone;
  }
  
  try {
    cachedUserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    lastTimeZoneCheck = now;
    return cachedUserTimeZone;
  } catch (error) {
    console.warn('시간대 감지 실패, UTC로 대체:', error);
    cachedUserTimeZone = 'UTC';
    lastTimeZoneCheck = now;
    return cachedUserTimeZone;
  }
}

/**
 * Intl.DateTimeFormat 객체 캐싱 및 재사용
 */
function getCachedIntlFormatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cacheKey = `${timeZone}-${JSON.stringify(options)}`;
  
  let formatter = intlFormatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
    intlFormatterCache.set(cacheKey, formatter);
    
    // 캐시 크기 제한 (메모리 관리)
    if (intlFormatterCache.size > 50) {
      const firstKey = intlFormatterCache.keys().next().value;
      if (firstKey) {
        intlFormatterCache.delete(firstKey);
      }
    }
  }
  
  return formatter;
}

/**
 * 최적화된 시간대 약어 가져오기 (메모이제이션 적용)
 */
export function getTimeZoneCode(timeZone: string, language: SupportedLanguage = 'ko'): string {
  if (typeof window === 'undefined') {
    return 'UTC';
  }

  // 캐시 확인 (언어별로 다를 수 있으므로 키에 포함)
  const cacheKey = `${timeZone}-${language}`;
  const cached = timeZoneCodeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let result: string;

  try {
    // 1. 웹 데이터베이스에서 시간대 약어 찾기 (가장 빠른 경로)
    const abbreviation = TIMEZONE_ABBREVIATIONS[timeZone];
    if (abbreviation) {
      result = abbreviation;
    } else {
      // 2. Intl API로 시간대 약어 시도 (캐시된 formatter 사용)
      const formatter = getCachedIntlFormatter(timeZone, { timeZoneName: 'short' });
      const parts = formatter.formatToParts(new Date());
      const timeZonePart = parts.find(part => part.type === 'timeZoneName');
      
      // GMT 형식이 아닌 실제 약어라면 사용
      if (timeZonePart?.value && 
          !timeZonePart.value.includes('GMT') && 
          timeZonePart.value.length <= 5) {
        result = timeZonePart.value;
      } else {
        // 3. UTC 오프셋 계산 (최후 수단)
        result = calculateUtcOffset(timeZone);
      }
    }
    
    // 캐시에 저장
    timeZoneCodeCache.set(cacheKey, result);
    
    // 캐시 크기 제한
    if (timeZoneCodeCache.size > 100) {
      const firstKey = timeZoneCodeCache.keys().next().value;
      if (firstKey) {
        timeZoneCodeCache.delete(firstKey);
      }
    }
    
    return result;
    
  } catch (error) {
    console.warn('시간대 코드 가져오기 실패:', error);
    result = 'UTC';
    timeZoneCodeCache.set(cacheKey, result);
    return result;
  }
}

/**
 * UTC 오프셋 계산 최적화
 */
function calculateUtcOffset(timeZone: string): string {
  try {
    const dt = DateTime.now().setZone(timeZone);
    const offset = dt.offset;
    const hours = Math.floor(Math.abs(offset) / 60);
    const minutes = Math.abs(offset) % 60;
    const sign = offset >= 0 ? '+' : '-';
    
    return minutes === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
  } catch {
    return 'UTC';
  }
}

/**
 * 최적화된 시간대 변경 감지 (디바운싱 적용)
 */
export function watchTimeZoneChange(callback: (newTimeZone: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let currentTimeZone = getUserTimeZone();
  let currentOffset = new Date().getTimezoneOffset();
  let debounceTimer: NodeJS.Timeout | null = null;

  const debouncedCheck = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    debounceTimer = setTimeout(() => {
      try {
        const newTimeZone = getUserTimeZone(true); // 강제 새로고침
        const newOffset = new Date().getTimezoneOffset();
        
        if (newTimeZone !== currentTimeZone || newOffset !== currentOffset) {
          console.log('🌍 시간대 변경 감지:', {
            이전: `${currentTimeZone} (오프셋: ${currentOffset})`,
            현재: `${newTimeZone} (오프셋: ${newOffset})`,
          });
          
          currentTimeZone = newTimeZone;
          currentOffset = newOffset;
          
          // 캐시 무효화
          timeZoneCodeCache.clear();
          
          callback(newTimeZone);
        }
      } catch (error) {
        console.warn('시간대 체크 실패:', error);
      }
    }, TIMEZONE_CHECK_DEBOUNCE);
  };

  // 이벤트 리스너들
  const handleFocus = debouncedCheck;
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      debouncedCheck();
    }
  };

  // 주기적 체크
  const intervalId = setInterval(debouncedCheck, TIMEZONE_WATCH_INTERVAL);

  // 이벤트 등록
  window.addEventListener('focus', handleFocus, { passive: true });
  window.addEventListener('pageshow', handleFocus, { passive: true });
  document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

  // 정리 함수 반환
  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('pageshow', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    clearInterval(intervalId);
  };
}

/**
 * 최적화된 locale 문자열 변환
 */
function getLocaleString(language: SupportedLanguage): string {
  return LOCALE_MAP[language] || LOCALE_MAP.en;
}

/**
 * 최적화된 date-fns locale 가져오기
 */
export function getCurrentLocale(language: SupportedLanguage): Locale {
  return DATE_FNS_LOCALE_MAP[language] || DATE_FNS_LOCALE_MAP.en;
}

/**
 * 최적화된 날짜 포맷팅 (시간대 코드 포함 여부 선택 가능)
 */
export function formatDateWithTimeZone(
  utcDate: string | Date,
  formatString?: string,
  language: SupportedLanguage = 'ko',
  timeZone?: string,
  includeTimeZoneCode: boolean = true
): string {
  const userTimeZone = timeZone || getUserTimeZone();
  const locale = getCurrentLocale(language);
  const finalFormatString = formatString || DATE_FORMAT_MAP[language];
  
  try {
    // UTC 날짜를 사용자 시간대로 변환
    const zonedDate = toZonedTime(new Date(utcDate), userTimeZone);
    
    // 포맷팅
    const formattedDate = format(zonedDate, finalFormatString, { locale });
    
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
 * 최적화된 투표 기간 포맷팅
 */
export function formatVotePeriodWithTimeZone(
  startDate: string | Date,
  endDate: string | Date, 
  language: SupportedLanguage = 'ko',
  timeZone?: string
): string {
  const userTimeZone = timeZone || getUserTimeZone();
  const formatString = DATE_FORMAT_MAP[language];
  
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
 * 최적화된 간단한 날짜 포맷팅
 */
export function formatSimpleDateWithTimeZone(
  date: string | Date,
  language: SupportedLanguage = 'ko',
  timeZone?: string,
  includeTimeZoneCode: boolean = true
): string {
  const userTimeZone = timeZone || getUserTimeZone();
  const formatString = SIMPLE_DATE_FORMAT_MAP[language];
  
  return formatDateWithTimeZone(date, formatString, language, userTimeZone, includeTimeZoneCode);
}

/**
 * 최적화된 남은 시간 계산
 */
export function calculateRemainingTime(endTime: string): RemainingTime {
  // 클라이언트 사이드에서만 정확한 시간 계산
  const now = typeof window !== 'undefined' ? Date.now() : Date.now();
  const end = new Date(endTime).getTime();
  const distance = Math.max(0, end - now);

  // 비트 연산으로 성능 최적화
  const days = Math.floor(distance / 86400000); // 1000 * 60 * 60 * 24
  const hours = Math.floor((distance % 86400000) / 3600000); // 1000 * 60 * 60
  const minutes = Math.floor((distance % 3600000) / 60000); // 1000 * 60
  const seconds = Math.floor((distance % 60000) / 1000);

  return {
    days,
    hours,
    minutes,
    seconds,
  };
}

/**
 * 캐시 정리 함수 (메모리 관리)
 */
export function clearTimeZoneCaches(): void {
  cachedUserTimeZone = null;
  lastTimeZoneCheck = 0;
  timeZoneCodeCache.clear();
  intlFormatterCache.clear();
}

// 레거시 호환성을 위한 export
export const localeMap = DATE_FNS_LOCALE_MAP;
