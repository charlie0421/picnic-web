/**
 * SEO 유틸리티 함수
 * 
 * 구조화된 데이터(schema.org) 생성을 위한 유틸리티입니다.
 */

/**
 * 웹사이트 JSON-LD 스키마 생성
 */
export function createWebsiteSchema(url: string, name: string, description?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url,
    name,
    description,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${url}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    },
  };
}

/**
 * 조직 JSON-LD 스키마 생성
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
 * 유형별 페이지에 대한 BreadcrumbList JSON-LD 스키마 생성
 */
export function createBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * 자주 묻는 질문 FAQ JSON-LD 스키마 생성
 */
export function createFAQSchema(questions: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(q => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
      },
    })),
  };
}

/**
 * 투표 이벤트 Event JSON-LD 스키마 생성
 */
export function createVoteSchema(
  name: string,
  description: string,
  image?: string,
  startDate?: string,
  endDate?: string,
  url?: string
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name,
    description,
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
      name: '피크닉',
      url: 'https://picnic.com',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'KRW',
      availability: 'https://schema.org/InStock',
      url: url || 'https://picnic.com',
      validFrom: startDate,
    },
  };
}

/**
 * 제품 Product JSON-LD 스키마 생성
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
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    ...(image && { image }),
    ...(url && { url }),
    offers: {
      '@type': 'Offer',
      price: price?.toString() || '0',
      priceCurrency: currency,
      availability: `https://schema.org/${availability}`,
      ...(url && { url }),
    },
    brand: {
      '@type': 'Organization',
      name: '피크닉',
    },
  };
}

/**
 * 미디어 페이지용 JSON-LD 스키마
 */
export function createMediaSchema(
  name: string,
  description: string,
  image?: string,
  datePublished?: string,
  author?: string,
  url?: string
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: name,
    description,
    ...(image && { image }),
    ...(datePublished && { datePublished }),
    ...(author && { author: { '@type': 'Person', name: author } }),
    ...(url && { url }),
    publisher: {
      '@type': 'Organization',
      name: '피크닉',
      logo: {
        '@type': 'ImageObject',
        url: 'https://picnic.com/images/logo.png',
      },
    },
  };
} 