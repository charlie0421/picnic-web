/**
 * SEO 메타데이터 유틸리티 함수
 * 
 * Next.js의 메타데이터 API를 활용한 SEO 최적화 유틸리티입니다.
 */

import { Metadata } from 'next';
import { SITE_URL } from '../constants/static-pages';
import { Language, SUPPORTED_LANGUAGES } from '@/config/settings';

/**
 * 언어별 사이트 정보
 */
const SITE_INFO: Record<Language, {
  title: string;
  description: string;
  keywords: string[];
  locale: string;
}> = {
  ko: {
    title: '피크닉',
    description: '피크닉 - K-Pop 아티스트를 위한 투표 및 미디어 플랫폼',
    keywords: ['피크닉', 'K-Pop', '투표', '아이돌', '팬덤', '리워드', '미디어'],
    locale: 'ko_KR',
  },
  en: {
    title: 'Picnic',
    description: 'Picnic - Voting and Media Platform for K-Pop Artists',
    keywords: ['Picnic', 'K-Pop', 'Voting', 'Idol', 'Fandom', 'Rewards', 'Media'],
    locale: 'en_US',
  },
  ja: {
    title: 'ピクニック',
    description: 'ピクニック - K-Popアーティストのための投票とメディアプラットフォーム',
    keywords: ['ピクニック', 'K-Pop', '投票', 'アイドル', 'ファンダム', 'リワード', 'メディア'],
    locale: 'ja_JP',
  },
  zh: {
    title: '野餐',
    description: '野餐 - K-Pop艺人投票和媒体平台',
    keywords: ['野餐', 'K-Pop', '投票', '偶像', '粉丝', '奖励', '媒体'],
    locale: 'zh_CN',
  },
  id: {
    title: 'Picnic',
    description: 'Picnic - Platform Voting dan Media untuk Artis K-Pop',
    keywords: ['Picnic', 'K-Pop', 'Voting', 'Idol', 'Fandom', 'Rewards', 'Media'],
    locale: 'id_ID',
  },
};

/**
 * 언어별 hreflang 링크 생성
 */
export function generateHreflangLinks(currentPath: string): Record<string, string> {
  const hreflangLinks: Record<string, string> = {};
  
  // 각 지원 언어에 대한 hreflang 링크 생성
  SUPPORTED_LANGUAGES.forEach(lang => {
    const langPath = lang === 'ko' ? currentPath : `/${lang}${currentPath}`;
    hreflangLinks[SITE_INFO[lang].locale.replace('_', '-')] = `${SITE_URL}${langPath}`;
  });
  
  // x-default 링크 추가 (기본 언어)
  hreflangLinks['x-default'] = `${SITE_URL}${currentPath}`;
  
  return hreflangLinks;
}

/**
 * 국제화된 메타데이터 생성
 */
export function createInternationalizedMetadata(
  language: Language,
  path: string = '/',
  customData?: {
    title?: string;
    description?: string;
    imageUrl?: string;
    keywords?: string[];
  }
): Metadata {
  const siteInfo = SITE_INFO[language];
  const title = customData?.title || siteInfo.title;
  const description = customData?.description || siteInfo.description;
  const keywords = customData?.keywords || siteInfo.keywords;
  
  // 정규화된 경로 (언어 프리픽스 제거)
  const normalizedPath = path.startsWith(`/${language}`) 
    ? path.replace(`/${language}`, '') || '/'
    : path;
  
  // 현재 언어의 canonical URL
  const canonicalPath = language === 'ko' 
    ? normalizedPath 
    : `/${language}${normalizedPath}`;
  
  // hreflang 링크 생성
  const hreflangLinks = generateHreflangLinks(normalizedPath);
  
  // 이미지 URL 처리
  const imageUrl = customData?.imageUrl || `${SITE_URL}/images/og-image.jpg`;
  const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : `${SITE_URL}${imageUrl}`;
  
  return {
    title: {
      default: title,
      template: `%s | ${siteInfo.title}`,
    },
    description,
    keywords,
    generator: 'Next.js',
    applicationName: siteInfo.title,
    referrer: 'origin-when-cross-origin',
    authors: [{ name: `${siteInfo.title} 팀` }],
    creator: siteInfo.title,
    publisher: siteInfo.title,
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    metadataBase: new URL(SITE_URL),
    alternates: {
      canonical: canonicalPath,
      languages: hreflangLinks,
    },
    openGraph: {
      type: 'website',
      siteName: siteInfo.title,
      title,
      description,
      locale: siteInfo.locale,
      url: `${SITE_URL}${canonicalPath}`,
      images: [
        {
          url: fullImageUrl,
          width: 1200,
          height: 630,
          alt: description,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [fullImageUrl],
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
      other: [
        {
          rel: 'mask-icon',
          url: '/favicon/safari-pinned-tab.svg',
          color: '#5bbad5',
        },
      ],
    },
    manifest: '/site.webmanifest',
    verification: {
      google: 'google-site-verification=YOUR_VERIFICATION_CODE',
      yandex: 'YOUR_YANDEX_VERIFICATION_CODE',
    },
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
}

/**
 * 기본 메타데이터 객체 (하위 호환성)
 */
export const DEFAULT_METADATA: Metadata = createInternationalizedMetadata('ko');

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
 * 언어별 페이지 메타데이터 생성
 */
export function createLocalizedPageMetadata(
  language: Language,
  path: string,
  title: string,
  description: string,
  options?: {
    imageUrl?: string;
    keywords?: string[];
    customMetadata?: Partial<Metadata>;
  }
): Metadata {
  const baseMetadata = createInternationalizedMetadata(
    language,
    path,
    {
      title,
      description,
      imageUrl: options?.imageUrl,
      keywords: options?.keywords,
    }
  );
  
  return {
    ...baseMetadata,
    ...options?.customMetadata,
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
  const alternates: Record<string, string> = {};
  const languages: Record<string, string> = {};
  
  // 한국어 및 영어 경로 생성
  languages['ko-KR'] = alternatePathGenerator('ko');
  languages['en-US'] = alternatePathGenerator('en');
  
  return {
    alternates: {
      canonical: alternatePathGenerator(params.lang || 'ko'),
      languages,
    },
  };
}

/**
 * 언어별 구조화된 데이터 생성
 */
export function createLocalizedJsonLd(
  language: Language,
  type: string,
  data: Record<string, any>
): string {
  // 언어가 지원되는지 확인하고 기본 언어로 폴백
  const validLanguage = SUPPORTED_LANGUAGES.includes(language) ? language : 'ko';
  const siteInfo = SITE_INFO[validLanguage];
  
  if (!siteInfo) {
    console.warn(`Site info not found for language: ${validLanguage}, using Korean as fallback`);
    const fallbackSiteInfo = SITE_INFO['ko'];
    
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': type,
      inLanguage: validLanguage,
      ...data,
      // 사이트 정보 추가
      ...(type === 'WebSite' && {
        name: fallbackSiteInfo.title,
        description: fallbackSiteInfo.description,
        url: SITE_URL,
      }),
    };
    
    return JSON.stringify(jsonLd);
  }
  
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': type,
    inLanguage: validLanguage,
    ...data,
    // 사이트 정보 추가
    ...(type === 'WebSite' && {
      name: siteInfo.title,
      description: siteInfo.description,
      url: SITE_URL,
    }),
  };
  
  return JSON.stringify(jsonLd);
}

/**
 * JSON-LD 구조화된 데이터 생성 유틸리티 (하위 호환성)
 * 
 * @param type 스키마 타입
 * @param data 스키마 데이터
 */
export function createJsonLd(type: string, data: Record<string, any>): string {
  return createLocalizedJsonLd('ko', type, data);
} 