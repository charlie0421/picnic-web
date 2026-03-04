# Weekly Refactor Plan: Batch 6 — picnic-web 300줄+ 파일 분해

## Context

이전 배치 완료:
- Batch 1 (top3): 100% | Batch 2: 93% | Batch 3: 95% | Batch 4: 95% | Batch 5: 93%

이번 대상: 남은 300줄+ 파일 중 가장 큰 3개 실전 코드:
- `utils/retry.ts` (506줄)
- `app/[lang]/error.tsx` (504줄)
- `components/client/vote/dialogs/VoteDialog.tsx` (495줄)

**Hard Constraints**: behavior-preserving, 공개 API 변경 금지, 새 의존성 금지, 순환 의존성 금지.

---

## 1. retry.ts (506줄 → 4파일)

### 새 파일 트리
```
utils/
├── retry.ts              (~50줄) barrel re-export
├── retry-types.ts        (~110줄) enum + types + interfaces + preset configs
├── retry-core.ts         (~200줄) ExtendedRetryUtility 클래스
└── retry-wrappers.ts     (~160줄) 래퍼 함수 + createRetryCondition + 데코레이터 + 훅
```

### 심볼 이동맵

**`retry-types.ts`** (신규, ~110줄) — 타입 + 설정 상수:
- `RetryStrategy` enum (lines 13-18)
- `RetryCondition` type (line 23)
- `ExtendedRetryConfig` interface (lines 28-34)
- `RetryResult<T>` interface (lines 39-46)
- `DEFAULT_RETRY_CONFIG` const (lines 51-63)
- `NETWORK_RETRY_CONFIG` const (lines 68-75)
- `DATABASE_RETRY_CONFIG` const (lines 80-90)
- `EXTERNAL_API_RETRY_CONFIG` const (lines 95-107)
- Import: `AppError, ErrorCategory, ErrorSeverity, RetryConfig` from `@/utils/error`
- 모두 export

**`retry-core.ts`** (신규, ~200줄) — 핵심 재시도 클래스:
- `ExtendedRetryUtility` class (lines 112-306)
  - `static withRetry<T>()` — 메인 재시도 로직 (lines 116-234, 119줄)
  - `private static shouldRetry()` (lines 239-256)
  - `private static calculateDelay()` (lines 261-298)
  - `private static sleep()` (lines 303-305)
- Import: `retry-types`에서 `DEFAULT_RETRY_CONFIG`, `ExtendedRetryConfig`, `RetryResult`, `RetryStrategy`
- Import: `@/utils/error`에서 `AppError, ErrorCategory, ErrorSeverity`
- Import: `@/utils/logger`에서 `logger`

**`retry-wrappers.ts`** (신규, ~160줄) — 래퍼 + 팩토리 + 유틸:
- `withNetworkRetry<T>()` (lines 311-320)
- `withDatabaseRetry<T>()` (lines 325-334)
- `withExternalApiRetry<T>()` (lines 339-348)
- `createRetryCondition` factory object (lines 353-403) — httpStatus, errorMessage, maxAttempts, and, or
- `withAutoRetry<>()` decorator (lines 408-435)
- `useRetryableOperation<T>()` React hook (lines 440-450)
- `withServerActionRetry<T>()` (lines 455-476)
- `withBatchRetry<T>()` (lines 481-507)
- Import: `retry-core`에서 `ExtendedRetryUtility`
- Import: `retry-types`에서 configs + types

**`retry.ts`** (수정, ~50줄) — barrel:
```ts
export * from './retry-types';
export { ExtendedRetryUtility } from './retry-core';
export * from './retry-wrappers';
```

### 외부 import 영향
- `hooks/useRetryableQuery.ts`: `from '@/utils/retry'` — barrel 경로 불변
- `hooks/retryable-query-presets.ts`: `from '@/utils/retry'` — barrel 경로 불변
- `hooks/retryable-query-types.ts`: `from '@/utils/retry'` — barrel 경로 불변
- `hooks/useVoteSubmit.ts`: `from '@/utils/retry'` — barrel 경로 불변
- `lib/data-fetching/server/fetchers.ts`: `from '@/utils/retry'` — barrel 경로 불변

---

## 2. error.tsx (504줄 → 3파일)

### 새 파일 트리
```
app/[lang]/
├── error.tsx               (~230줄) 메인 컴포넌트
├── error-data.ts           (~155줄) 언어 데이터 + 번역 + 타입
└── ErrorDecorations.tsx    (~120줄) 배경 애니메이션
```

### 심볼 이동맵

**`error-data.ts`** (신규, ~155줄) — 순수 데이터, React 의존 없음:
- `languages` 객체 (lines 13-26, 12개 언어)
- `translations` 객체 (lines 28-149, 12개 언어 × 8키)
- `Language` type (line 151)
- `ErrorPageProps` interface (lines 153-156)
- 모두 export

**`ErrorDecorations.tsx`** (신규, ~120줄) — 'use client' 컴포넌트:
- `<style jsx>` 블록: float, sparkle, gradientShift, pulse 애니메이션 (lines 480-502)
- 배경 원형 6개 (lines 253-259)
- 반짝이는 이모지 5개 (lines 261-266)
- Props: `children: React.ReactNode`

**`error.tsx`** (수정, ~230줄):
- `error-data`에서 `languages`, `translations`, `Language`, `ErrorPageProps` import
- `ErrorDecorations`에서 배경 컴포넌트 import
- 컴포넌트 로직 유지 (useState, useEffect, handlers, lines 158-222)
- JSX: `<ErrorDecorations>` 래핑 + 메인 콘텐츠 (500, 제목, 설명, 언어 선택기, 버튼)
- `export default` 유지 — Next.js 라우팅 계약 보존

### 외부 import 영향
- Next.js convention 파일 — 외부에서 import하지 않음
- `export default` 유지 필수

---

## 3. VoteDialog.tsx (495줄 → 4파일)

### 새 파일 트리
```
components/client/vote/dialogs/
├── VoteDialog.tsx           (~180줄) 메인 컴포넌트 (슬림 JSX)
├── useVoteDialog.ts         (~120줄) 상태 + 핸들러 + SWR 훅
├── VoteDialogOverlays.tsx   (~100줄) 투표 중 + 성공 오버레이
└── VoteBalanceDisplay.tsx   (~130줄) 잔액 표시 (로딩/에러/데이터/빈 상태)
```

### 심볼 이동맵

**`useVoteDialog.ts`** (신규, ~120줄) — 비즈니스 로직 훅:
- `UserBalance` interface (lines 20-24)
- `fetcher` const (line 26)
- 5개 useState (lines 36-40)
- SWR 프로필 데이터 페칭 (lines 47-54)
- `userBalance` 계산 (lines 56-60)
- `handleUseAllChange` (lines 63-70)
- `handleAmountChange` (lines 73-81)
- `handleInputChange` (lines 84-97)
- `handleVoteSubmit` (lines 100-147)
- `getLocale` (lines 150-159)
- 반환: `{ voteAmount, useAllVotes, isVoting, voteError, showSuccess, userBalance, isLoadingBalance, balanceError, handleUseAllChange, handleAmountChange, handleInputChange, handleVoteSubmit, getLocale, mutateProfile, setVoteAmount, onClose }`
- Import: `useLanguageStore`, `useWithdrawalGuard`, `useAuth`, `useSWR`

**`VoteDialogOverlays.tsx`** (신규, ~100줄) — 'use client' 컴포넌트:
- `VotingOverlay` — 투표 처리 중 오버레이 (lines 180-223)
- `SuccessOverlay` — 성공 애니메이션 오버레이 (lines 225-249)
- Props: `isVoting: boolean`, `showSuccess: boolean`, `t: Function`
- Import: `motion, AnimatePresence` from `framer-motion`, `Image` from `next/image`

**`VoteBalanceDisplay.tsx`** (신규, ~130줄) — 'use client' 컴포넌트:
- 로딩 상태 UI (lines 269-281)
- 에러 상태 UI (lines 282-305)
- 잔액 정보 UI (lines 306-349, starCandy + bonus + total)
- 빈 상태 UI (lines 350-363)
- Props: `isLoadingBalance, balanceError, userBalance, getLocale, mutateProfile, t`
- Import: `motion` from `framer-motion`, `AnimatedCount`

**`VoteDialog.tsx`** (수정, ~180줄):
- `useVoteDialog()` 호출
- JSX 슬림화: `<VoteDialogOverlays>`, `<VoteBalanceDisplay>`, 헤더, 투표 수량 입력, 에러 메시지, 버튼
- `export default VoteDialog` 유지

### 외부 import 영향
- `VoteDetailPresenter.tsx`: `import VoteDialog from '../dialogs/VoteDialog'` — 경로 불변
- default export 유지 필수

---

## 실행 순서

3개 파일은 완전 독립적. 순차 실행:

1. **retry.ts** — `retry-types.ts` → `retry-core.ts` → `retry-wrappers.ts` → barrel 전환
2. **error.tsx** — `error-data.ts` → `ErrorDecorations.tsx` → 슬림화
3. **VoteDialog.tsx** — `useVoteDialog.ts` → `VoteDialogOverlays.tsx` → `VoteBalanceDisplay.tsx` → 슬림화

각 단계 완료 후 검증:
```bash
cd picnic-web && npx tsc --noEmit
cd picnic-web && npx madge --circular [files]
```

## 최종 줄 수 요약

| 파일 | Before | After (메인) | 신규 파일 수 | 총계 |
|------|--------|-------------|-------------|------|
| retry.ts | 506 | ~50 barrel | 3 | ~520 |
| error.tsx | 504 | ~230 | 2 | ~505 |
| VoteDialog.tsx | 495 | ~180 | 3 | ~530 |

모든 메인 파일이 300줄 이하. 추출된 파일도 200줄 이하.

## 리스크

| 리스크 | 대응 |
|--------|------|
| barrel `export *` 순환 의존성 | retry-wrappers → retry-core → retry-types (단방향) |
| `<style jsx>` 분리 후 animation 참조 | ErrorDecorations에 style jsx 포함, children으로 메인 콘텐츠 래핑 |
| VoteDialog props drilling | useVoteDialog 훅이 모든 상태/핸들러 반환, 서브컴포넌트에 개별 전달 |
| `export default` 보존 | error.tsx, VoteDialog.tsx 모두 default export 유지 |
