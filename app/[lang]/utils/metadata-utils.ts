/**
 * SEO 메타데이터 유틸리티 함수
 * 
 * Next.js의 메타데이터 API를 활용한 SEO 최적화 유틸리티입니다.
 */

import { Metadata } from 'next';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type Language } from '@/config/settings';
import { SITE_URL } from '../constants/static-pages';

/**
 * 앱 언어 코드 → BCP 47 언어 태그 (`<html lang>`·hreflang 공용).
 * 경로 세그먼트는 소문자(`zh-tw`)지만 표준 표기는 지역을 대문자로 쓴다(`zh-TW`).
 * SUPPORTED_LANGUAGES 를 전수 커버해야 하며, 빠진 항목이 있으면 타입 에러가 난다.
 */
const LANGUAGE_TAG_BY_LANGUAGE: Record<Language, string> = {
  en: 'en',
  ko: 'ko',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
  ja: 'ja',
  id: 'id',
  es: 'es',
  bn: 'bn',
  tl: 'tl',
  th: 'th',
  vi: 'vi',
  my: 'my',
};

export function isSupportedLanguage(value: string | null | undefined): value is Language {
  return !!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** 지원 언어면 BCP 47 태그, 아니면 null */
export function getLanguageTag(lang: string | null | undefined): string | null {
  return isSupportedLanguage(lang) ? LANGUAGE_TAG_BY_LANGUAGE[lang] : null;
}

/** 앱 언어 코드 → og:locale (`language_TERRITORY`). */
const OPEN_GRAPH_LOCALE_BY_LANGUAGE: Record<Language, string> = {
  en: 'en_US',
  ko: 'ko_KR',
  'zh-cn': 'zh_CN',
  'zh-tw': 'zh_TW',
  ja: 'ja_JP',
  id: 'id_ID',
  es: 'es_ES',
  bn: 'bn_BD',
  tl: 'tl_PH',
  th: 'th_TH',
  vi: 'vi_VN',
  my: 'my_MM',
};

export function getOpenGraphLocale(lang: string | null | undefined): string {
  return OPEN_GRAPH_LOCALE_BY_LANGUAGE[isSupportedLanguage(lang) ? lang : DEFAULT_LANGUAGE];
}

type LanguageAlternates = NonNullable<NonNullable<Metadata['alternates']>['languages']>;

/** 언어별 경로 생성기로 hreflang 맵(12개 언어 + x-default=기본 언어)을 만든다. */
function languageAlternatesFrom(localizedPath: (lang: Language) => string): LanguageAlternates {
  const languages: Record<string, string> = {};
  for (const lang of SUPPORTED_LANGUAGES) {
    languages[LANGUAGE_TAG_BY_LANGUAGE[lang]] = localizedPath(lang);
  }
  languages['x-default'] = localizedPath(DEFAULT_LANGUAGE);
  return languages;
}

/**
 * 로케일 접두사를 뺀 경로(예: `/vote/295`)로 hreflang 맵을 만든다.
 * 상대 경로라 metadataBase 로 절대 URL 이 된다.
 */
export function buildLanguageAlternates(pathWithoutLocale: string): LanguageAlternates {
  const path = pathWithoutLocale.replace(/^\/+|\/+$/g, '');
  return languageAlternatesFrom((lang) => (path ? `/${lang}/${path}` : `/${lang}`));
}

/**
 * DB 에 저장된 이미지 경로(`vote/…png`, `/reward/…jpg`)를 OG 크롤러가 받을 수 있는 CDN 절대 URL 로 바꾼다.
 * 변환 파라미터(`?f=webp` 등)는 붙이지 않는다 — 원본(png/jpg)이 크롤러 호환성이 가장 좋다.
 */
export function resolveCdnImageUrl(path: string | null | undefined): string | null {
  const trimmed = path?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const cdnBase = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/+$/, '');
  if (!cdnBase) return null;
  return `${cdnBase}/${trimmed.replace(/^\/+/, '')}`;
}

/** 공식 브랜드 표기(결정 #4): 한국어 '피크닉', 그 외 언어 'Picnic'. */
export function brandName(lang: string): string {
  return lang === 'ko' ? '피크닉' : 'Picnic';
}

const SITE_DESCRIPTION = {
  ko: '피크닉 - K-Pop 아티스트를 위한 투표 및 미디어 플랫폼',
  en: 'Picnic - Voting and media platform for K-Pop artists',
} as const;

export function siteDescription(lang: string): string {
  return lang === 'ko' ? SITE_DESCRIPTION.ko : SITE_DESCRIPTION.en;
}

/** 언어별 브랜드 메타데이터 — 레이아웃 기본값에 덮어쓴다. 페이지 title 에는 브랜드를 넣지 않는다(템플릿이 붙인다). */
export function brandMetadata(lang: string): Partial<Metadata> {
  const brand = brandName(lang);
  const description = siteDescription(lang);
  return {
    title: { default: brand, template: `%s | ${brand}` },
    description,
    applicationName: brand,
    authors: [{ name: brand }],
    creator: brand,
    publisher: brand,
  };
}

/**
 * 기본 메타데이터 객체
 */
export const DEFAULT_METADATA: Metadata = {
  title: {
    default: '피크닉',
    template: '%s | 피크닉',
  },
  description: '피크닉 - K-Pop 아티스트를 위한 투표 및 미디어 플랫폼',
  generator: 'Next.js',
  applicationName: '피크닉',
  referrer: 'origin-when-cross-origin',
  keywords: ['피크닉', 'K-Pop', '투표', '아이돌', '팬덤', '리워드', '미디어'],
  authors: [{ name: '피크닉 팀' }],
  creator: '피크닉',
  publisher: '피크닉',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(SITE_URL),
  alternates: {
    // Next 가 './' 를 현재 요청 경로로 해석한다 — 페이지가 따로 정하지 않으면 자기 자신이 canonical.
    // (홈 고정 canonical 은 하위 페이지 전부를 홈의 중복으로 선언했다)
    // hreflang 은 경로를 아는 페이지가 buildLanguageAlternates 로 넣는다.
    canonical: './',
  },
  openGraph: {
    type: 'website',
    url: './',
    siteName: '피크닉',
    title: '피크닉',
    description: '피크닉 - K-Pop 아티스트를 위한 투표 및 미디어 플랫폼',
    images: [
      {
        url: `${SITE_URL}/images/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: '피크닉 - K-Pop 아티스트를 위한 투표 및 미디어 플랫폼',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '피크닉',
    description: '피크닉 - K-Pop 아티스트를 위한 투표 및 미디어 플랫폼',
    images: [`${SITE_URL}/images/twitter-image.jpg`],
    creator: '@picnic',
    site: '@picnic',
  },
  icons: {
    icon: [
      { url: '/favicon/favicon.ico' },
      { url: '/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/favicon/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

/**
 * 페이지별 메타데이터 생성 함수
 * 
 * 페이지 제목과 설명을 받아 메타데이터 객체를 생성합니다.
 * 
 * @param title 페이지 제목
 * @param description 페이지 설명
 * @param metadata 추가 메타데이터 (선택사항)
 * @returns 메타데이터 객체
 */
export function createPageMetadata(
  title: string,
  description: string,
  metadata?: Partial<Metadata>
): Metadata {
  return {
    ...DEFAULT_METADATA,
    title,
    description,
    openGraph: {
      ...DEFAULT_METADATA.openGraph,
      title,
      description,
    },
    twitter: {
      ...DEFAULT_METADATA.twitter,
      title,
      description,
    },
    ...metadata,
  };
}

/**
 * 이미지 메타데이터 생성 함수
 * 
 * 이미지 URL을 받아 OpenGraph 및 Twitter Card 메타데이터를 생성합니다.
 * 
 * @param imageUrl 이미지 URL (CDN 경로인 경우 자동으로 전체 URL로 변환)
 * @param alt 이미지 대체 텍스트
 * @param width 이미지 너비 (기본값: 1200)
 * @param height 이미지 높이 (기본값: 630)
 * @returns 이미지 메타데이터 객체
 */
export function createImageMetadata(
  imageUrl: string,
  alt: string,
  width: number = 1200,
  height: number = 630
): Pick<Metadata, 'openGraph' | 'twitter'> {
  // CDN 이미지 URL이 아닌 경우 CDN URL로 변환
  const fullImageUrl = imageUrl.startsWith('http')
    ? imageUrl
    : `https://cdn.picnic.fan/${imageUrl}`;
  
  return {
    openGraph: {
      images: [
        {
          url: fullImageUrl,
          width,
          height,
          alt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      images: [fullImageUrl],
    },
  };
}

/**
 * 동적 페이지 메타데이터를 위한 유틸리티 함수
 * 
 * 동적 페이지에서 데이터 의존적인 메타데이터를 생성할 때 사용합니다.
 * 
 * @param title 페이지 제목
 * @param description 페이지 설명
 * @param imageUrl 이미지 URL (선택사항)
 * @param imageAlt 이미지 대체 텍스트 (선택사항)
 * @param additionalMetadata 추가 메타데이터 (선택사항)
 * @returns 메타데이터 객체
 */
export function createDynamicPageMetadata(
  title: string,
  description: string,
  imageUrl?: string,
  imageAlt?: string,
  additionalMetadata?: Partial<Metadata>
): Metadata {
  const baseMetadata = createPageMetadata(title, description, additionalMetadata);
  
  if (imageUrl) {
    const imageMetadata = createImageMetadata(
      imageUrl,
      imageAlt || title,
      1200,
      630
    );
    
    return {
      ...baseMetadata,
      ...imageMetadata,
    };
  }
  
  return baseMetadata;
}

/**
 * 동적 경로 페이지를 위한 메타데이터 생성 유틸리티
 * 
 * @param params 경로 매개변수
 * @param alternatePathGenerator 대체 경로 생성기 함수
 */
export function createDynamicPathMetadata(
  params: Record<string, string>,
  alternatePathGenerator: (locale: string) => string
): Partial<Metadata> {
  return {
    alternates: {
      canonical: alternatePathGenerator(
        isSupportedLanguage(params.lang) ? params.lang : DEFAULT_LANGUAGE,
      ),
      languages: languageAlternatesFrom(alternatePathGenerator),
    },
  };
}

/**
 * JSON-LD 구조화된 데이터 생성 유틸리티
 * 
 * @param type 스키마 타입
 * @param data 스키마 데이터
 */
export function createJsonLd(type: string, data: Record<string, any>): string {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': type,
    ...data,
  };
  
  return JSON.stringify(jsonLd);
} 