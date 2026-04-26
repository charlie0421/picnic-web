import {enUS, id, ja, ko, zhCN} from "date-fns/locale";

export interface RemainingTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

// 타입 안전성을 위한 지원 언어 정의
export type SupportedLanguage = 'ko' | 'en' | 'ja' | 'zh-cn' | 'id' | 'zh-tw' | 'es' | 'bn' | 'tl' | 'th' | 'vi' | 'my';

// 상수 분리로 성능 최적화
export const LOCALE_MAP = {
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
  id: 'id-ID',
  my: 'my-MM'
} as const;

export const DATE_FNS_LOCALE_MAP = {
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
  my: enUS,
} as const;

export const DATE_FORMAT_MAP = {
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
  id: 'dd MMM yyyy HH:mm',
  my: 'd MMM yyyy HH:mm'
} as const;

export const SIMPLE_DATE_FORMAT_MAP = {
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
  id: 'dd MMM HH:mm',
  my: 'd MMM HH:mm'
} as const;

// 상대적 시간 표시 상수
export const RELATIVE_TIME_THRESHOLDS = {
  MINUTE: 60 * 1000,           // 1분
  HOUR: 60 * 60 * 1000,        // 1시간
  DAY: 24 * 60 * 60 * 1000,    // 1일
  WEEK: 7 * 24 * 60 * 60 * 1000, // 1주
  MONTH: 30 * 24 * 60 * 60 * 1000, // 1개월
} as const;

// 언어별 상대적 시간 포맷
export const RELATIVE_TIME_FORMATS = {
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
  es: {
    justNow: 'Justo ahora',
    minutesAgo: (n: number) => `hace ${n} minuto${n === 1 ? '' : 's'}`,
    hoursAgo: (n: number) => `hace ${n} hora${n === 1 ? '' : 's'}`,
    daysAgo: (n: number) => `hace ${n} día${n === 1 ? '' : 's'}`,
    weeksAgo: (n: number) => `hace ${n} semana${n === 1 ? '' : 's'}`,
    monthsAgo: (n: number) => `hace ${n} mes${n === 1 ? '' : 'es'}`,
    today: 'Hoy',
    yesterday: 'Ayer',
  },
  bn: {
    justNow: 'এইমাত্র',
    minutesAgo: (n: number) => `${n} মিনিট আগে`,
    hoursAgo: (n: number) => `${n} ঘণ্টা আগে`,
    daysAgo: (n: number) => `${n} দিন আগে`,
    weeksAgo: (n: number) => `${n} সপ্তাহ আগে`,
    monthsAgo: (n: number) => `${n} মাস আগে`,
    today: 'আজ',
    yesterday: 'গতকাল',
  },
  tl: {
    justNow: 'Ngayon lang',
    minutesAgo: (n: number) => `${n} minuto ang nakalipas`,
    hoursAgo: (n: number) => `${n} oras ang nakalipas`,
    daysAgo: (n: number) => `${n} araw ang nakalipas`,
    weeksAgo: (n: number) => `${n} linggo ang nakalipas`,
    monthsAgo: (n: number) => `${n} buwan ang nakalipas`,
    today: 'Ngayon',
    yesterday: 'Kahapon',
  },
  th: {
    justNow: 'เมื่อสักครู่',
    minutesAgo: (n: number) => `${n} นาทีที่แล้ว`,
    hoursAgo: (n: number) => `${n} ชั่วโมงที่แล้ว`,
    daysAgo: (n: number) => `${n} วันที่แล้ว`,
    weeksAgo: (n: number) => `${n} สัปดาห์ที่แล้ว`,
    monthsAgo: (n: number) => `${n} เดือนที่แล้ว`,
    today: 'วันนี้',
    yesterday: 'เมื่อวาน',
  },
  vi: {
    justNow: 'Vừa xong',
    minutesAgo: (n: number) => `${n} phút trước`,
    hoursAgo: (n: number) => `${n} giờ trước`,
    daysAgo: (n: number) => `${n} ngày trước`,
    weeksAgo: (n: number) => `${n} tuần trước`,
    monthsAgo: (n: number) => `${n} tháng trước`,
    today: 'Hôm nay',
    yesterday: 'Hôm qua',
  },
} as const;

/**
 * 최적화된 locale 문자열 변환
 */
export function getLocaleString(language: SupportedLanguage): string {
  return LOCALE_MAP[language] || LOCALE_MAP.en;
}

// 레거시 호환성을 위한 export
export const localeMap = DATE_FNS_LOCALE_MAP;
