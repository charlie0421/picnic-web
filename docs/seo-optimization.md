# SEO 최적화 가이드

이 문서는 피크닠 웹 프로젝트의 SEO(검색 엔진 최적화) 전략과 구현 방법에 대해 설명합니다.

## 목차

1. [개요](#개요)
2. [메타데이터 구성](#메타데이터-구성)
3. [구조화된 데이터](#구조화된-데이터)
4. [이미지 최적화](#이미지-최적화)
5. [다국어 지원](#다국어-지원)
6. [사이트맵 및 로봇 텍스트](#사이트맵-및-로봇-텍스트)
7. [페이지별 SEO 전략](#페이지별-seo-전략)

## 개요

피크닠 웹사이트는 Next.js의 App Router를 사용하며, 각 페이지별로 최적화된 SEO 설정을 적용하고 있습니다. 주요 구현 방식은 다음과 같습니다:

- Next.js의 메타데이터 API를 활용한 페이지별 메타데이터 설정
- JSON-LD 기반의 구조화된 데이터(Schema.org) 구현
- 다국어 경로에 대한 canonical URL 및 언어 대체 링크 제공
- 동적 페이지에 대한 ISR(Incremental Static Regeneration) 적용으로 성능 최적화

## 메타데이터 구성

기본 메타데이터 설정은 `app/[lang]/utils/metadata-utils.ts` 파일에 정의되어 있습니다.

### 기본 메타데이터

```typescript
export const DEFAULT_METADATA: Metadata = {
  title: {
    default: '피크닠',
    template: '%s | 피크닠',
  },
  description: '피크닠 - K-Pop 아티스트를 위한 투표 및 미디어 플랫폼',
  // 기타 메타데이터 필드들
};
```

### 페이지별 메타데이터 생성

페이지별 메타데이터를 생성하기 위해 `createPageMetadata` 함수를 사용합니다:

```typescript
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils';

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  return createPageMetadata(
    '페이지 제목',
    '페이지 설명',
    {
      // 추가 메타데이터
      alternates: {
        canonical: `${SITE_URL}/${params.lang}/경로`,
        languages: {
          'ko-KR': `${SITE_URL}/ko/경로`,
          'en-US': `${SITE_URL}/en/경로`,
        },
      },
    }
  );
}
```

## 구조화된 데이터

구조화된 데이터(Schema.org)는 `app/[lang]/utils/seo-utils.ts` 파일에 정의된 유틸리티 함수를 통해 생성됩니다:

### 주요 스키마 타입

- **웹사이트**: `createWebsiteSchema` - 웹사이트 기본 정보 제공
- **조직**: `createOrganizationSchema` - 피크닠 조직 정보 제공
- **투표 이벤트**: `createVoteSchema` - 투표 페이지에 사용
- **상품**: `createProductSchema` - 리워드 페이지에 사용
- **FAQ**: `createFAQSchema` - FAQ 페이지에 사용

### 구조화된 데이터 적용 예시

```tsx
import { createVoteSchema } from '@/app/[lang]/utils/seo-utils';

// 컴포넌트 내부에서
const schemaData = createVoteSchema(
  title,
  description,
  imageUrl,
  startDate,
  endDate,
  url
);

return (
  <>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schemaData)
      }}
    />
    {/* 페이지 컨텐츠 */}
  </>
);
```

## 이미지 최적화

이미지 메타데이터 최적화를 위해 `createImageMetadata` 함수를 사용합니다:

```typescript
const imageMetadata = createImageMetadata(
  imageUrl,
  altText,
  1200, // 너비
  630   // 높이
);
```

소셜 미디어 공유(OG 및 Twitter 카드)를 위한 이미지는 다음과 같이 구성됩니다:

- 기본 OG 이미지: `/images/og-image.jpg` (1200x630px)
- 트위터 카드 이미지: `/images/twitter-image.jpg` (1200x600px)
- 컨텐츠별 이미지: CDN 이미지 URL을 메타데이터에 동적으로 적용

## 다국어 지원

다국어 지원을 위해 다음과 같은 전략을 사용합니다:

1. `app/[lang]` 경로 파라미터를 활용한 언어별 URL 구성
2. 각 페이지 메타데이터에 언어별 대체 URL 제공
3. 언어별 canonical URL 설정

```typescript
alternates: {
  canonical: `${SITE_URL}/${params.lang}/경로`,
  languages: {
    'ko-KR': `${SITE_URL}/ko/경로`,
    'en-US': `${SITE_URL}/en/경로`,
  },
},
```

## 사이트맵 및 로봇 텍스트

사이트맵 및 로봇 텍스트는 Next.js의 메타데이터 라우트를 사용하여 구현됩니다:

- **사이트맵**: `app/[lang]/sitemap.ts`
- **로봇 텍스트**: `app/[lang]/robots.ts`

사이트맵은 정적 페이지와 데이터베이스에서 가져온 동적 페이지를 모두 포함합니다.

## 페이지별 SEO 전략

### 메인 페이지

- 주요 키워드와 서비스 설명에 중점
- 구조화된 데이터로 `WebSite` 타입 사용

### 투표 페이지

- 투표 활동을 `Event` 타입으로 구조화
- 투표 시작/종료 시간, 설명 등 상세 정보 제공
- ISR을 사용한 동적 메타데이터 생성

### 리워드 페이지

- 리워드를 `Product` 타입으로 구조화
- 가격, 제품 설명, 이미지 등 상세 정보 제공
- 주요 리워드는 정적 경로로 사전 생성하여 SEO 강화

### 기타 페이지

- FAQ 페이지: `FAQPage` 스키마 적용으로 검색 결과에 리치 스니펫 표시
- 공지사항: `Article` 스키마 적용으로 컨텐츠 유형 명시

## 결론

피크닠 웹사이트의 SEO 전략은 Next.js의 최신 기능을 활용하여 검색 엔진 및 소셜 미디어에서의 노출을 극대화하는 방향으로 설계되었습니다. 페이지를 추가하거나 수정할 때는 이 문서에 설명된 패턴을 따라 SEO 설정을 적용해 주세요. 