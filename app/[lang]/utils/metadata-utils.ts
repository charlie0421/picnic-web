/**
 * SEO 메타데이터 유틸리티 함수
 * 
 * Next.js의 메타데이터 API를 활용한 SEO 최적화 유틸리티입니다.
 */

import { Metadata } from 'next';
import { SITE_URL } from '../constants/static-pages';

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
  colorScheme: 'light',
  creator: '피크닉',
  publisher: '피크닉',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
    languages: {
      'ko-KR': '/',
      'en-US': '/en',
    },
  },
  openGraph: {
    type: 'website',
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
    other: [
      {
        rel: 'mask-icon',
        url: '/favicon/safari-pinned-tab.svg',
        color: '#5bbad5',
      },
    ],
  },
  manifest: '/site.webmanifest',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
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