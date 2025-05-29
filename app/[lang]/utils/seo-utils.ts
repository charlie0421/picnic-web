/**
 * SEO 유틸리티 함수
 * 
 * 구조화된 데이터(schema.org) 생성을 위한 유틸리티입니다.
 * 국제화를 지원하여 언어별 최적화된 메타데이터를 생성합니다.
 */

import { Language } from '@/config/settings';

// 언어별 조직 정보
const ORGANIZATION_INFO: Record<Language, {
  name: string;
  description: string;
}> = {
  ko: {
    name: '피크닉',
    description: 'K-Pop 아티스트를 위한 투표 및 미디어 플랫폼',
  },
  en: {
    name: 'Picnic',
    description: 'Voting and Media Platform for K-Pop Artists',
  },
  ja: {
    name: 'ピクニック',
    description: 'K-Popアーティストのための投票とメディアプラットフォーム',
  },
  zh: {
    name: '野餐',
    description: 'K-Pop艺人投票和媒体平台',
  },
  id: {
    name: 'Picnic',
    description: 'Platform Voting dan Media untuk Artis K-Pop',
  },
};

/**
 * 언어별 웹사이트 JSON-LD 스키마 생성
 */
export function createLocalizedWebsiteSchema(
  language: Language,
  url: string,
  name?: string,
  description?: string
) {
  const orgInfo = ORGANIZATION_INFO[language];
  
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url,
    name: name || orgInfo.name,
    description: description || orgInfo.description,
    inLanguage: language,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${url}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    },
  };
}

/**
 * 웹사이트 JSON-LD 스키마 생성 (하위 호환성)
 */
export function createWebsiteSchema(url: string, name: string, description?: string) {
  return createLocalizedWebsiteSchema('ko', url, name, description);
}

/**
 * 언어별 조직 JSON-LD 스키마 생성
 */
export function createLocalizedOrganizationSchema(
  language: Language,
  url: string,
  logo?: string,
  sameAs?: string[]
) {
  const orgInfo = ORGANIZATION_INFO[language];
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: orgInfo.name,
    description: orgInfo.description,
    url,
    inLanguage: language,
    ...(logo && { logo }),
    ...(sameAs && { sameAs }),
  };
}

/**
 * 조직 JSON-LD 스키마 생성 (하위 호환성)
 */
export function createOrganizationSchema(
  name: string,
  url: string,
  logo?: string,
  sameAs?: string[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url,
    ...(logo && { logo }),
    ...(sameAs && { sameAs }),
  };
}

/**
 * 언어별 BreadcrumbList JSON-LD 스키마 생성
 */
export function createLocalizedBreadcrumbSchema(
  language: Language,
  items: Array<{ name: string; url: string }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    inLanguage: language,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * BreadcrumbList JSON-LD 스키마 생성 (하위 호환성)
 */
export function createBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return createLocalizedBreadcrumbSchema('ko', items);
}

/**
 * 언어별 FAQ JSON-LD 스키마 생성
 */
export function createLocalizedFAQSchema(
  language: Language,
  questions: Array<{ question: string; answer: string }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: language,
    mainEntity: questions.map(q => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
        inLanguage: language,
      },
    })),
  };
}

/**
 * FAQ JSON-LD 스키마 생성 (하위 호환성)
 */
export function createFAQSchema(questions: Array<{ question: string; answer: string }>) {
  return createLocalizedFAQSchema('ko', questions);
}

/**
 * 언어별 투표 이벤트 Event JSON-LD 스키마 생성
 */
export function createLocalizedVoteSchema(
  language: Language,
  name: string,
  description: string,
  image?: string,
  startDate?: string,
  endDate?: string,
  url?: string
) {
  const orgInfo = ORGANIZATION_INFO[language];
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name,
    description,
    inLanguage: language,
    ...(image && { image }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
    ...(url && { url }),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: {
      '@type': 'VirtualLocation',
      url: url || 'https://picnic.com',
    },
    organizer: {
      '@type': 'Organization',
      name: orgInfo.name,
      url: 'https://picnic.com',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: language === 'ko' ? 'KRW' : 'USD',
      availability: 'https://schema.org/InStock',
      url: url || 'https://picnic.com',
      validFrom: startDate,
    },
  };
}

/**
 * 투표 이벤트 Event JSON-LD 스키마 생성 (하위 호환성)
 */
export function createVoteSchema(
  name: string,
  description: string,
  image?: string,
  startDate?: string,
  endDate?: string,
  url?: string
) {
  return createLocalizedVoteSchema('ko', name, description, image, startDate, endDate, url);
}

/**
 * 언어별 제품 Product JSON-LD 스키마 생성
 */
export function createLocalizedProductSchema(
  language: Language,
  name: string,
  description: string,
  image?: string,
  price?: number | null,
  currency: string = 'KRW',
  availability: 'InStock' | 'OutOfStock' | 'PreOrder' = 'InStock',
  url?: string
) {
  const orgInfo = ORGANIZATION_INFO[language];
  
  // 언어별 기본 통화 설정
  const defaultCurrency = language === 'ko' ? 'KRW' : 
                         language === 'ja' ? 'JPY' :
                         language === 'zh' ? 'CNY' :
                         language === 'id' ? 'IDR' : 'USD';
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    inLanguage: language,
    ...(image && { image }),
    ...(url && { url }),
    offers: {
      '@type': 'Offer',
      price: price?.toString() || '0',
      priceCurrency: currency || defaultCurrency,
      availability: `https://schema.org/${availability}`,
      ...(url && { url }),
    },
    brand: {
      '@type': 'Organization',
      name: orgInfo.name,
    },
  };
}

/**
 * 제품 Product JSON-LD 스키마 생성 (하위 호환성)
 */
export function createProductSchema(
  name: string,
  description: string,
  image?: string,
  price?: number | null,
  currency: string = 'KRW',
  availability: 'InStock' | 'OutOfStock' | 'PreOrder' = 'InStock',
  url?: string
) {
  return createLocalizedProductSchema('ko', name, description, image, price, currency, availability, url);
}

/**
 * 언어별 미디어 페이지용 JSON-LD 스키마 생성
 */
export function createLocalizedMediaSchema(
  language: Language,
  name: string,
  description: string,
  image?: string,
  datePublished?: string,
  author?: string,
  url?: string
) {
  const orgInfo = ORGANIZATION_INFO[language];
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: name,
    description,
    inLanguage: language,
    ...(image && { image }),
    ...(datePublished && { datePublished }),
    ...(author && { author: { '@type': 'Person', name: author } }),
    ...(url && { url }),
    publisher: {
      '@type': 'Organization',
      name: orgInfo.name,
      logo: {
        '@type': 'ImageObject',
        url: 'https://picnic.com/images/logo.png',
      },
    },
  };
}

/**
 * 미디어 페이지용 JSON-LD 스키마 생성 (하위 호환성)
 */
export function createMediaSchema(
  name: string,
  description: string,
  image?: string,
  datePublished?: string,
  author?: string,
  url?: string
) {
  return createLocalizedMediaSchema('ko', name, description, image, datePublished, author, url);
} 