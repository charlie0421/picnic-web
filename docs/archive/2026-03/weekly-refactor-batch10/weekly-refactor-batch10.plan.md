# Weekly Refactor Batch 10 Plan

## Target Files

| File | Lines | Category |
|------|:-----:|----------|
| `components/client/banner/BannerCarouselClient.tsx` | 443 | Client Component |
| `lib/data-fetching/server/user-service.ts` | 422 | Server Data Fetching |
| `utils/error/handlers.ts` | 402 | Error Handling |

## Hard Constraints

- Behavior-preserving: 기존 동작 100% 유지
- 공개 API/export 변경 금지
- 새 의존성 금지
- 순환 의존성 금지
- 모든 파일 300줄 이하

---

## 1. BannerCarouselClient.tsx (443줄 → 2파일)

### 분석
- 443줄 단일 컴포넌트. 상수/유틸 함수(lines 1-57) + 컴포넌트(lines 59-440)
- `useBannerCarousel` 훅으로 상태/로직 추출 가능 (lines 63-264, ~200줄)
- Consumer: `BannerListPresenter.tsx` 1곳만

### 새 파일 트리
```
components/client/banner/
├── BannerCarouselClient.tsx  (~220줄) 컴포넌트 렌더링
└── useBannerCarousel.ts      (~210줄) 커스텀 훅 + 상수/유틸
```

### 심볼 이동맵

**`useBannerCarousel.ts`** (신규, ~210줄):
- `MIN_PRIORITY_COUNT`, `AUTO_PLAY_DELAY`, `AUTOPLAY_INITIAL_DELAY` 상수
- `getSlidesPerView(width)` 순수 함수
- `useIsomorphicLayoutEffect` 훅 alias
- `resolveSlidesPerViewFromCss(element)` 순수 함수
- `useBannerCarousel(totalSlides)` 커스텀 훅:
  - containerRef, slidesPerView, currentIndex, loadedIndices 상태
  - isVisible, prefersReducedMotionRef
  - maxIndex, markVisibleAsLoaded, computeNextIndex, computePrevIndex
  - stopAutoplay, startAutoplay
  - handleNext, handlePrev, goToPage
  - pages, currentPage, heroIndex, loadedSet, prioritySet, trackStyle
  - 반환: `{ containerRef, slidesPerView, currentIndex, loadedSet, prioritySet, heroIndex, trackStyle, handleNext, handlePrev, goToPage, pages, currentPage, isVisible }`

**`BannerCarouselClient.tsx`** (수정, ~220줄):
- `useBannerCarousel`에서 import
- `BannerCarouselClientProps` interface 유지
- JSX 렌더링만: empty state, single slide, carousel + 네비게이션 + dots + CSS
- `export default BannerCarouselClient` 유지

### 외부 import 영향
- `BannerListPresenter.tsx`에서 `BannerCarouselClient` import → default export 유지, 변경 없음

---

## 2. user-service.ts (422줄 → 2파일)

### 분석
- 4개 독립 함수: `getVoteHistory`(160줄), `getUserPosts`(90줄), `getUserComments`(105줄), `getRechargeHistory`(63줄)
- `getVoteHistory`가 가장 크고 복잡 (join + transform)
- Consumer 4곳, 각각 하나의 함수만 import

### 새 파일 트리
```
lib/data-fetching/server/
├── user-service.ts              (~210줄) getUserPosts + getUserComments + getRechargeHistory + barrel
└── user-service-vote-history.ts (~200줄) getVoteHistory 단독
```

### 심볼 이동맵

**`user-service-vote-history.ts`** (신규, ~200줄):
- `getVoteHistory` 함수 전체 (160줄 + import)
- `safeMultiLangText` 헬퍼 (인라인)
- `transformedHistory` 변환 로직

**`user-service.ts`** (수정, ~210줄):
- `getUserPosts`, `getUserComments`, `getRechargeHistory` 유지
- barrel re-export: `export { getVoteHistory } from './user-service-vote-history'`

### 외부 import 영향
- 4개 consumer 모두 `from '@/lib/data-fetching/server/user-service'` → barrel 유지, 변경 없음

---

## 3. error/handlers.ts (402줄 → 2파일)

### 분석
- 5개 클래스/객체: `ErrorTransformer`(115줄), `ConsoleErrorLogger`(20줄), `RetryUtility`(42줄), `ErrorHandler`(58줄), `ErrorContextBuilder`(40줄)
- 하단 편의 함수: `createError`, `createContext`, 레거시 호환 함수 (60줄)
- Consumer: `utils/error.ts` 1곳 (barrel)

### 새 파일 트리
```
utils/error/
├── handlers.ts              (~230줄) ErrorHandler + ErrorTransformer + 편의함수 + barrel
└── error-retry.ts           (~120줄) RetryUtility + ErrorContextBuilder + ConsoleErrorLogger
```

### 심볼 이동맵

**`error-retry.ts`** (신규, ~120줄):
- `ErrorLogger` interface
- `ConsoleErrorLogger` class
- `RetryUtility` class
- `ErrorContextBuilder` class

**`handlers.ts`** (수정, ~230줄):
- `PG_ERROR_MAPPING` 상수
- `ErrorTransformer` class
- `ErrorHandler` class (ConsoleErrorLogger import)
- `createError` 객체
- `createContext` 함수
- 레거시 호환 함수 (`handleSupabaseError`, `handleError`)
- barrel re-export: `export { ErrorLogger, ConsoleErrorLogger, RetryUtility, ErrorContextBuilder } from './error-retry'`

### 외부 import 영향
- `utils/error.ts` barrel에서 `from './handlers'`로 import → barrel 유지, 변경 없음

### 순환 의존성 리스크
- `error-retry.ts` → `./core` (AppError, ErrorCategory 등)
- `handlers.ts` → `./core` + `./error-retry` (단방향)
- `error-retry.ts`에서 `ErrorTransformer` 필요 (RetryUtility.withRetry에서 사용)
  → **해결**: `ErrorTransformer.fromUnknownError`를 콜백으로 주입하거나, RetryUtility가 catch에서 raw error를 re-throw하고 caller가 변환
  → **선택**: RetryUtility에 `errorTransformer` 파라미터 추가 — 순환 의존 방지

---

## 실행 순서

3개 파일 완전 독립. 병렬 실행:

1. **BannerCarouselClient.tsx** — `useBannerCarousel.ts` 생성 → 컴포넌트 슬림화
2. **user-service.ts** — `user-service-vote-history.ts` 생성 → barrel화
3. **error/handlers.ts** — `error-retry.ts` 생성 → handlers 슬림화

검증:
```bash
cd picnic-web && npx tsc --noEmit
cd picnic-web && npx madge --circular --extensions ts,tsx .
cd picnic-web && VERCEL=1 npm run build
```

## 최종 줄 수 요약

| File | Before | After (Main) | New Files | Total |
|------|--------|-------------|-----------|-------|
| BannerCarouselClient.tsx | 443 | ~220 | 1 (~210) | ~430 |
| user-service.ts | 422 | ~210 | 1 (~200) | ~410 |
| error/handlers.ts | 402 | ~230 | 1 (~120) | ~350 |

## 리스크

| Risk | Mitigation |
|------|------------|
| useBannerCarousel 훅 의존성 배열 | 원본 useCallback/useMemo deps 그대로 복사 |
| RetryUtility ↔ ErrorTransformer 순환 | RetryUtility에서 errorTransformer를 파라미터로 주입 |
| 'use client' 누락 | useBannerCarousel.ts에도 필요할 수 있음 — React 훅 사용하므로 불필요 (훅 파일은 use client 불필요, 호출하는 컴포넌트가 client) |
| server-only import | user-service-vote-history.ts에 `import 'server-only'` 필수 |
