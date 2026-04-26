export const SUPPORTED_LANGUAGES = [
  'en',
  'ko',
  'zh-cn',   // 중국어(간체)
  'zh-tw',   // 중국어(번체, 대만)
  'ja',
  'id',
  'es',      // 스페인어
  'bn',      // 뱅골어(방글라데시)
  'tl',      // 타갈로그어(필리핀)
  'th',      // 태국어
  'vi',      // 베트남어
  'my',      // 미얀마어
] as const;
export const DEFAULT_LANGUAGE = 'en';

export type Language = typeof SUPPORTED_LANGUAGES[number];

export const settings = {
  languages: {
    supported: SUPPORTED_LANGUAGES,
    default: DEFAULT_LANGUAGE as Language,
  },
  layout: {
    profileImage: {
      sizes: {
        sm: 'w-8 h-8',
        md: 'w-12 h-12',
        lg: 'w-16 h-16',
      },
    },
  },
} as const;

export type Settings = typeof settings; 