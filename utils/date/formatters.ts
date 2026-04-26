import { format, isToday, isYesterday, isThisYear } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Locale } from 'date-fns/locale';
import {
  type SupportedLanguage,
  type RemainingTime,
  DATE_FNS_LOCALE_MAP,
  DATE_FORMAT_MAP,
  SIMPLE_DATE_FORMAT_MAP,
  RELATIVE_TIME_THRESHOLDS,
  RELATIVE_TIME_FORMATS,
} from './date-constants';
import { getUserTimeZone, getTimeZoneCode } from './timezone';

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
    const formats = RELATIVE_TIME_FORMATS[language] || RELATIVE_TIME_FORMATS.en;

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
