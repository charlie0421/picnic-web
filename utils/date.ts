import {enUS, id, ja, ko, zhCN, type Locale} from "date-fns/locale";
import { format, formatDistanceToNow, isToday, isYesterday, isThisYear } from 'date-fns';
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
export type SupportedLanguage = 'ko' | 'en' | 'ja' | 'zh-cn' | 'id' | 'zh-tw' | 'es' | 'bn' | 'tl' | 'th' | 'vi';

// 상수 분리로 성능 최적화
const LOCALE_MAP = {
  ko: 'ko-KR',
  ja: 'ja-JP', 
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
  es: 'es-ES',
  bn: 'bn-BD',
  tl: 'fil-PH',
  th: 'th-TH',
  vi: 'vi-VN',
  en: 'en-US',
  id: 'id-ID'
} as const;

const DATE_FNS_LOCALE_MAP = {
  ko,
  ja,
  'zh-cn': zhCN,
  'zh-tw': zhCN,
  es: enUS,
  bn: enUS,
  tl: enUS,
  th: enUS,
  vi: enUS,
  en: enUS,
  id: id,
} as const;

const DATE_FORMAT_MAP = {
  ko: 'yyyy년 M월 d일 HH:mm',
  en: 'MMM d, yyyy HH:mm',
  ja: 'yyyy年M月d日 HH:mm', 
  'zh-cn': 'yyyy年M月d日 HH:mm',
  'zh-tw': 'yyyy年M月d日 HH:mm',
  es: 'd MMM yyyy HH:mm',
  bn: 'd MMM yyyy HH:mm',
  tl: 'd MMM yyyy HH:mm',
  th: 'd MMM yyyy HH:mm',
  vi: 'd MMM yyyy HH:mm',
  id: 'dd MMM yyyy HH:mm'
} as const;

const SIMPLE_DATE_FORMAT_MAP = {
  ko: 'M월 d일 HH:mm',
  en: 'MMM d HH:mm', 
  ja: 'M月d日 HH:mm',
  'zh-cn': 'M月d日 HH:mm',
  'zh-tw': 'M月d日 HH:mm',
  es: 'd MMM HH:mm',
  bn: 'd MMM HH:mm',
  tl: 'd MMM HH:mm',
  th: 'd MMM HH:mm',
  vi: 'd MMM HH:mm',
  id: 'dd MMM HH:mm'
} as const;

// 상대적 시간 표시 상수
const RELATIVE_TIME_THRESHOLDS = {
  MINUTE: 60 * 1000,           // 1분
  HOUR: 60 * 60 * 1000,        // 1시간
  DAY: 24 * 60 * 60 * 1000,    // 1일
  WEEK: 7 * 24 * 60 * 60 * 1000, // 1주
  MONTH: 30 * 24 * 60 * 60 * 1000, // 1개월
} as const;

// 언어별 상대적 시간 포맷
const RELATIVE_TIME_FORMATS = {
  ko: {
    justNow: '방금 전',
    minutesAgo: (n: number) => `${n}분 전`,
    hoursAgo: (n: number) => `${n}시간 전`,
    daysAgo: (n: number) => `${n}일 전`,
    weeksAgo: (n: number) => `${n}주 전`,
    monthsAgo: (n: number) => `${n}개월 전`,
    today: '오늘',
    yesterday: '어제',
  },
  en: {
    justNow: 'Just now',
    minutesAgo: (n: number) => n === 1 ? '1 minute ago' : `${n} minutes ago`,
    hoursAgo: (n: number) => n === 1 ? '1 hour ago' : `${n} hours ago`,
    daysAgo: (n: number) => n === 1 ? '1 day ago' : `${n} days ago`,
    weeksAgo: (n: number) => n === 1 ? '1 week ago' : `${n} weeks ago`,
    monthsAgo: (n: number) => n === 1 ? '1 month ago' : `${n} months ago`,
    today: 'Today',
    yesterday: 'Yesterday',
  },
  ja: {
    justNow: 'たった今',
    minutesAgo: (n: number) => `${n}分前`,
    hoursAgo: (n: number) => `${n}時間前`,
    daysAgo: (n: number) => `${n}日前`,
    weeksAgo: (n: number) => `${n}週間前`,
    monthsAgo: (n: number) => `${n}ヶ月前`,
    today: '今日',
    yesterday: '昨日',
  },
  'zh-cn': {
    justNow: '刚刚',
    minutesAgo: (n: number) => `${n}分钟前`,
    hoursAgo: (n: number) => `${n}小时前`,
    daysAgo: (n: number) => `${n}天前`,
    weeksAgo: (n: number) => `${n}周前`,
    monthsAgo: (n: number) => `${n}个月前`,
    today: '今天',
    yesterday: '昨天',
  },
  'zh-tw': {
    justNow: '剛剛',
    minutesAgo: (n: number) => `${n}分鐘前`,
    hoursAgo: (n: number) => `${n}小時前`,
    daysAgo: (n: number) => `${n}天前`,
    weeksAgo: (n: number) => `${n}週前`,
    monthsAgo: (n: number) => `${n}個月前`,
    today: '今天',
    yesterday: '昨天',
  },
  id: {
    justNow: 'Baru saja',
    minutesAgo: (n: number) => `${n} menit yang lalu`,
    hoursAgo: (n: number) => `${n} jam yang lalu`,
    daysAgo: (n: number) => `${n} hari yang lalu`,
    weeksAgo: (n: number) => `${n} minggu yang lalu`,
    monthsAgo: (n: number) => `${n} bulan yang lalu`,
    today: 'Hari ini',
    yesterday: 'Kemarin',
  },
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

/**
 * 상대적 시간 표시 (예: "3시간 전", "2일 전")
 */
export function formatRelativeTime(
  date: string | Date,
  language: SupportedLanguage = 'ko',
  options: {
    useAbsolute?: boolean;      // 특정 임계값 이후 절대 시간 표시
    absoluteThreshold?: number; // 절대 시간으로 전환하는 임계값 (일)
    showTime?: boolean;         // 시간 포함 여부
  } = {}
): string {
  const {
    useAbsolute = true,
    absoluteThreshold = 7, // 7일 후부터 절대 시간
    showTime = false
  } = options;

  try {
    const now = new Date();
    const targetDate = new Date(date);
    const diff = now.getTime() - targetDate.getTime();
    const formats = RELATIVE_TIME_FORMATS[language];

    // 미래 날짜 처리
    if (diff < 0) {
      return formatDateWithTimeZone(date, undefined, language, undefined, false);
    }

    // 방금 전 (1분 이내)
    if (diff < RELATIVE_TIME_THRESHOLDS.MINUTE) {
      return formats.justNow;
    }

    // 분 단위 (1시간 이내)
    if (diff < RELATIVE_TIME_THRESHOLDS.HOUR) {
      const minutes = Math.floor(diff / RELATIVE_TIME_THRESHOLDS.MINUTE);
      return formats.minutesAgo(minutes);
    }

    // 시간 단위 (1일 이내)
    if (diff < RELATIVE_TIME_THRESHOLDS.DAY) {
      const hours = Math.floor(diff / RELATIVE_TIME_THRESHOLDS.HOUR);
      return formats.hoursAgo(hours);
    }

    // 오늘/어제 구분
    if (isToday(targetDate)) {
      const hours = Math.floor(diff / RELATIVE_TIME_THRESHOLDS.HOUR);
      return hours > 0 ? formats.hoursAgo(hours) : formats.today;
    }

    if (isYesterday(targetDate)) {
      return showTime 
        ? `${formats.yesterday} ${format(targetDate, 'HH:mm')}`
        : formats.yesterday;
    }

    // 일 단위 (1주 이내)
    if (diff < RELATIVE_TIME_THRESHOLDS.WEEK) {
      const days = Math.floor(diff / RELATIVE_TIME_THRESHOLDS.DAY);
      return formats.daysAgo(days);
    }

    // 절대 시간으로 전환 조건 확인
    const daysDiff = Math.floor(diff / RELATIVE_TIME_THRESHOLDS.DAY);
    if (useAbsolute && daysDiff > absoluteThreshold) {
      // 올해 내 날짜면 월/일만, 다른 해면 년/월/일
      const formatString = isThisYear(targetDate) 
        ? (showTime ? SIMPLE_DATE_FORMAT_MAP[language] : 'M월 d일')
        : (showTime ? DATE_FORMAT_MAP[language] : 'yyyy년 M월 d일');
      
      return formatDateWithTimeZone(date, formatString, language, undefined, false);
    }

    // 주 단위 (1개월 이내)
    if (diff < RELATIVE_TIME_THRESHOLDS.MONTH) {
      const weeks = Math.floor(diff / RELATIVE_TIME_THRESHOLDS.WEEK);
      return formats.weeksAgo(weeks);
    }

    // 월 단위
    const months = Math.floor(diff / RELATIVE_TIME_THRESHOLDS.MONTH);
    return formats.monthsAgo(months);

  } catch (error) {
    console.warn('상대적 시간 포맷팅 실패:', error);
    return formatDateWithTimeZone(date, undefined, language, undefined, false);
  }
}

/**
 * 스마트 날짜 포맷팅 (상황에 따라 상대/절대 시간 자동 선택)
 */
export function formatSmartDate(
  date: string | Date,
  language: SupportedLanguage = 'ko',
  context: 'post' | 'comment' | 'detailed' = 'post'
): string {
  const now = new Date();
  const targetDate = new Date(date);
  const diff = now.getTime() - targetDate.getTime();
  const daysDiff = Math.floor(diff / RELATIVE_TIME_THRESHOLDS.DAY);

  switch (context) {
    case 'post':
      // 게시물: 3일 이내는 상대 시간, 그 이후는 절대 시간
      return formatRelativeTime(date, language, {
        useAbsolute: true,
        absoluteThreshold: 3,
        showTime: false
      });
      
    case 'comment':
      // 댓글: 1일 이내는 상대 시간, 그 이후는 절대 시간
      return formatRelativeTime(date, language, {
        useAbsolute: true,
        absoluteThreshold: 1,
        showTime: true
      });
      
    case 'detailed':
      // 상세: 항상 절대 시간 + 시간대
      return formatDateWithTimeZone(date, undefined, language);
      
    default:
      return formatRelativeTime(date, language);
  }
}

/**
 * 게시물 날짜 포맷팅 (게시물에 특화된 스마트 날짜 표시)
 */
export function formatPostDate(
  date: string | Date,
  language: SupportedLanguage = 'ko'
): string {
  return formatSmartDate(date, language, 'post');
}

/**
 * 댓글 날짜 포맷팅 (댓글에 특화된 스마트 날짜 표시)
 */
export function formatCommentDate(
  date: string | Date,
  language: SupportedLanguage = 'ko'
): string {
  return formatSmartDate(date, language, 'comment');
}

// 레거시 호환성을 위한 export
export const localeMap = DATE_FNS_LOCALE_MAP;
