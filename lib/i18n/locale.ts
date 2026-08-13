import { SUPPORTED_LANGUAGES, type Language } from '@/config/settings';

/**
 * 앱 언어 코드 → Intl 로케일.
 *
 * 이 매핑이 빠지면 Intl 이 en-US 로 떨어져 **날짜·숫자가 미국식으로 표시된다**.
 * 소멸일처럼 사용자가 날짜를 보고 행동해야 하는 화면에서는 오해를 부른다.
 * (예: 한국어가 아닌 언어에서 "9/15/2026" 로 보이면 일/월 순서를 착각할 수 있다)
 *
 * SUPPORTED_LANGUAGES 를 전수 커버해야 하며, 빠진 항목이 있으면 타입 에러가 난다.
 */
const LOCALE_BY_LANGUAGE: Record<Language, string> = {
  en: 'en-US',
  ko: 'ko-KR',
  ja: 'ja-JP',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
  es: 'es-ES',
  vi: 'vi-VN',
  id: 'id-ID',
  th: 'th-TH',
  bn: 'bn-BD',
  tl: 'fil-PH',
  my: 'my-MM',
};

export function intlLocale(language: string): string {
  return LOCALE_BY_LANGUAGE[language as Language] ?? 'en-US';
}

/** 테스트용 — 지원 언어 전수 커버 확인 */
export const SUPPORTED_INTL_LOCALES = SUPPORTED_LANGUAGES.map((l) => LOCALE_BY_LANGUAGE[l]);
