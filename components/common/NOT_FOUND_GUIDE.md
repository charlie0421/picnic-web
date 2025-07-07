# UniversalNotFound 컴포넌트 사용 가이드

## 개요

`UniversalNotFound`는 모든 404 페이지에서 사용할 수 있는 범용적인 컴포넌트입니다. 
페이지 타입에 따라 다른 메시지를 표시하고, 글로벌 경로와 언어별 경로 모두를 지원합니다.

## 현재 구조

```
app/
├── not-found.tsx                          # 글로벌 404 (언어 감지)
└── [lang]/
    ├── not-found.tsx                      # 언어별 메인 404
    └── (main)/
        ├── media/not-found.tsx            # 미디어 전용 404
        └── vote/[id]/not-found.tsx        # 투표 전용 404
```

## 사용법

### 1. 기본 사용법

```tsx
import UniversalNotFound from '@/components/common/UniversalNotFound';

export default function NotFound() {
  return (
    <UniversalNotFound 
      pageType="general"
      useGlobalLanguageDetection={false}
      showContactButton={true}
    />
  );
}
```

### 2. 페이지별 특화 사용법

#### 미디어 페이지
```tsx
<UniversalNotFound 
  pageType="media"
  useGlobalLanguageDetection={false}
  showContactButton={false}
/>
```

#### 투표 페이지
```tsx
<UniversalNotFound 
  pageType="vote"
  useGlobalLanguageDetection={false}
  showContactButton={false}
/>
```

#### 글로벌 404 (언어 감지)
```tsx
<UniversalNotFound 
  pageType="general"
  useGlobalLanguageDetection={true}
  showContactButton={true}
/>
```

### 3. 커스텀 옵션

```tsx
<UniversalNotFound 
  pageType="custom"
  customTitle="특별한 페이지를 찾을 수 없음"
  customDescription="이 특별한 페이지는 더 이상 존재하지 않습니다."
  customBackLink="/special-section"
  showContactButton={false}
/>
```

## Props 설명

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `pageType` | `string` | `'general'` | 페이지 타입 ('general', 'media', 'vote', 'gallery', 'store' 등) |
| `customTitle` | `string` | `undefined` | 커스텀 제목 (설정 시 기본 제목 대신 사용) |
| `customDescription` | `string` | `undefined` | 커스텀 설명 (설정 시 기본 설명 대신 사용) |
| `customBackLink` | `string` | `undefined` | 커스텀 뒤로가기 링크 |
| `showContactButton` | `boolean` | `true` | 문의하기 버튼 표시 여부 |
| `useGlobalLanguageDetection` | `boolean` | `false` | 글로벌 언어 감지 모드 (app/not-found.tsx에서 사용) |

## 새로운 페이지 타입 추가하기

### 1. 번역 키 추가

먼저 모든 언어 파일에 새로운 페이지의 번역 키를 추가합니다:

```json
// public/locales/ko.json
{
  "gallery": {
    "notFound": {
      "title": "갤러리를 찾을 수 없음",
      "description": "찾고 계신 갤러리가 삭제되었거나 이동되었을 수 있습니다.",
      "backButton": "갤러리 목록으로 돌아가기"
    }
  }
}
```

### 2. UniversalNotFound 컴포넌트에 케이스 추가

이미 `gallery`와 `store` 케이스가 준비되어 있습니다. 번역 키만 추가하면 자동으로 작동합니다.

새로운 타입이 필요한 경우 `getPageSpecificContent()` 함수에 새 케이스를 추가하세요:

```tsx
case 'newPageType':
  return {
    title: customTitle || (useGlobalLanguageDetection 
      ? `${getTranslation('newPageType')} ${getTranslation('title')}`
      : t('newPageType.notFound.title')),
    description: customDescription || (useGlobalLanguageDetection 
      ? getTranslation('description')
      : t('newPageType.notFound.description')),
    backLink: customBackLink || `/${lang}/new-page-type`,
    backLabel: useGlobalLanguageDetection 
      ? `${getTranslation('newPageType')} ${getTranslation('backButton')}`
      : t('newPageType.notFound.backButton'),
  };
```

### 3. 새 not-found.tsx 생성

```tsx
// app/[lang]/(main)/gallery/not-found.tsx
import UniversalNotFound from '@/components/common/UniversalNotFound';

export default function GalleryNotFound() {
  return (
    <UniversalNotFound 
      pageType="gallery"
      useGlobalLanguageDetection={false}
      showContactButton={false}
    />
  );
}
```

## 장점

### ✅ 확장성
- 새로운 페이지 타입을 쉽게 추가할 수 있습니다
- 각 페이지별 not-found.tsx는 단 몇 줄로 구성됩니다

### ✅ 일관성
- 모든 404 페이지가 동일한 디자인과 구조를 가집니다
- 전역적인 디자인 변경이 모든 페이지에 자동 적용됩니다

### ✅ 국제화 지원
- 언어별 라우트와 글로벌 라우트 모두 지원
- 브라우저 언어 감지 기능 내장

### ✅ 유지보수성
- 코드 중복이 대폭 줄어듭니다
- 하나의 컴포넌트만 수정하면 모든 404 페이지에 반영됩니다

## 마이그레이션 체크리스트

- [x] `UniversalNotFound` 컴포넌트 생성
- [x] 글로벌 `app/not-found.tsx` 생성
- [x] 기존 not-found.tsx 파일들을 범용 컴포넌트로 교체
- [x] 미디어, 투표 전용 not-found 페이지 간소화
- [x] 새로운 페이지 타입 추가 시 가이드라인 작성

## 주의사항

1. **글로벌 vs 언어별**: `useGlobalLanguageDetection` 플래그를 올바르게 설정해야 합니다.
2. **번역 키**: 새로운 페이지 타입 추가 시 모든 언어 파일에 번역 키를 추가해야 합니다.
3. **contact 링크**: contact 페이지가 실제로 존재하는지 확인해야 합니다.
4. **이미지 경로**: 로고 이미지 경로(`/images/logo.png`)가 올바른지 확인해야 합니다. 