# Weekly Refactor Batch 13 Plan

## 대상 파일 (3개, 각 300줄 초과)

| 파일 | Before | After | 신규 파일 |
|------|--------|-------|----------|
| `contexts/ErrorContext.tsx` | 366 | ~240 | `error-context-reducer.ts` (~130) |
| `components/common/ErrorBoundary.tsx` | 369 | ~270 | `DefaultErrorFallback.tsx` (~105) |
| `components/client/star-candy/usePaymentPolling.ts` | 368 | ~275 | `payment-polling-helpers.ts` (~120) |

## Hard Constraints
- behavior-preserving (동작 변경 없음)
- 공개 API / barrel export 변경 금지
- 새 의존성 금지, 순환 의존성 금지
- 모든 파일 300줄 이하

---

## 1. ErrorContext.tsx (366줄 → ~240 + ~130)

### Consumer (2)
- `components/common/GlobalErrorDisplay.tsx` → `useErrorState`, `useError`
- `hooks/useRetryableQuery.ts` → `useErrorHandler`

### 신규: `contexts/error-context-reducer.ts` (~130줄)
- `ErrorState` interface (8-15)
- `GlobalErrorState` interface (17-21)
- `ErrorAction` type union (24-30)
- `initialState` const (33-37)
- `errorReducer` function (40-123)
- `ErrorContextType` interface (126-144)

### 수정: `contexts/ErrorContext.tsx` (~240줄)
- import { ErrorState, GlobalErrorState, ErrorAction, initialState, errorReducer, ErrorContextType } from './error-context-reducer'
- ErrorProvider, useError, useErrorHandler, useErrorState 유지
- 'use client' 유지

### 외부 영향: 없음 (consumer는 훅만 import, 타입은 내부)

---

## 2. ErrorBoundary.tsx (369줄 → ~270 + ~105)

### Consumer (2)
- `components/common/index.ts` → barrel `export { default as ErrorBoundary }`
- `components/server/index.ts` → 다른 파일 (server/ErrorBoundary)

### 신규: `components/common/DefaultErrorFallback.tsx` (~105줄)
- 'use client'
- DefaultErrorFallback props type (인라인 → named type)
- DefaultErrorFallback function component (48-139)
- ErrorSeverity import from '@/utils/error'

### 수정: `components/common/ErrorBoundary.tsx` (~270줄)
- import { DefaultErrorFallback } from './DefaultErrorFallback'
- DefaultErrorFallback 함수 본문 제거 (92줄)
- GlobalErrorHandler, registerGlobalErrorHandler, ErrorBoundary class, 래퍼 컴포넌트, HOC 유지
- export default ErrorBoundary 유지

### 외부 영향: 없음 (DefaultErrorFallback은 외부 미사용)

---

## 3. usePaymentPolling.ts (368줄 → ~275 + ~120)

### Consumer (1)
- `components/client/star-candy/StarCandyProductsPresenter.tsx` → `usePaymentPolling`

### 신규: `components/client/star-candy/payment-polling-helpers.ts` (~120줄)
- `UsePaymentPollingParams` interface (11-20)
- `getStoredPaymentId()` — sessionStorage 읽기 (useCallback → 일반 함수)
- `setStoredPaymentIdToStorage(id)` — sessionStorage 쓰기
- `removeStoredPaymentId()` — sessionStorage 삭제
- `isPaymentVerified(result)` — 결제 검증 결과 확인
- `buildSuccessDialogConfig(verifyResult, ctx)` — 성공 다이얼로그 설정 생성 (63-136)
  - ctx: { products, currentLanguage, router, pathname, t, showDialog }
  - React.createElement 트리 반환

### 수정: `usePaymentPolling.ts` (~275줄)
- import helpers from './payment-polling-helpers'
- sessionStorage useCallback 3개 제거 → helpers 직접 호출
- isPaymentVerified useCallback 제거 → helpers 직접 호출
- showSuccessDialog useCallback → buildSuccessDialogConfig 호출로 간소화
- polling effect의 deps에서 helpers 함수 제거 (안정 참조)
- 나머지 로직 유지

### 외부 영향: 없음 (import 경로 불변)

---

## 실행 순서
3개 파일 완전 독립 → 병렬 에이전트 실행
검증: `npx tsc --noEmit` + `npm run build`
