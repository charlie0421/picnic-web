# Weekly Refactor Plan: Batch 5 — picnic-web 300줄+ 파일 분해

## Context

이전 배치 완료:
- Batch 1 (top3): 100% | Batch 2: 93% | Batch 3: 95% | Batch 4: 95%

이번 대상: 남은 300줄+ 파일 중 가장 큰 3개 실전 코드:
- `utils/jwt-parser.ts` (616줄)
- `hooks/useRetryableQuery.ts` (588줄)
- `app/[lang]/not-found.tsx` (534줄)

**Hard Constraints**: behavior-preserving, 공개 API 변경 금지, 새 의존성 금지, 순환 의존성 금지.

---

## 1. jwt-parser.ts (616줄 → 4파일)

### 새 파일 트리
```
utils/
├── jwt-parser.ts              (~30줄) barrel re-export
├── jwt-parser-core.ts         (~100줄) 디코딩 + 사용자 추출
├── jwt-parser-source.ts       (~260줄) 쿠키/localStorage 토큰 검색
└── jwt-parser-debug.ts        (~120줄) 디버깅 함수 + window 등록
```

### 심볼 이동맵

**`jwt-parser-core.ts`** (신규, ~100줄) — 토큰 디코딩 + 사용자 추출:
- `jwtDebug` const (lines 5-8)
- `debugLog(...args)` (lines 10-14)
- `debugWarn(...args)` (lines 16-20)
- `decodeJWTPayload(token)` (lines 25-43)
- `extractUserFromJWT(token)` (lines 373-428)
- 모두 export (jwt-parser-source, jwt-parser-debug에서 import)

**`jwt-parser-source.ts`** (신규, ~260줄) — 토큰 소스 검색:
- `getSupabaseTokenFromCookies()` (lines 48-281, 234줄) — 분할 쿠키 + 패턴 검색 + 로컬 환경
- `getSupabaseTokenFromStorage()` (lines 286-368, 83줄) — localStorage 검색
- `jwt-parser-core`에서 `debugLog`, `debugWarn` import

**`jwt-parser-debug.ts`** (신규, ~120줄) — 개발자 디버깅:
- `debugJWTInfo()` (lines 491-571, 81줄)
- `debugLocalCookies()` (lines 576-608, 33줄)
- window 등록 블록 (lines 610-617)
- `jwt-parser-core`에서 `decodeJWTPayload`, `extractUserFromJWT`, `debugLog` import
- `jwt-parser-source`에서 `getSupabaseTokenFromCookies`, `getSupabaseTokenFromStorage` import

**`jwt-parser.ts`** (수정, ~30줄) — barrel:
```ts
export { getInstantUserFromCookies, getTokenExpiry, isTokenExpiringSoon, getTokenRemainingMs } from './jwt-parser-public';
export { debugJWTInfo, debugLocalCookies } from './jwt-parser-debug';
```
- `getInstantUserFromCookies` (lines 433-452) — jwt-parser-core + jwt-parser-source 조합
- `getTokenExpiry` (lines 457-465)
- `isTokenExpiringSoon` (lines 470-477)
- `getTokenRemainingMs` (lines 482-486)

Note: 공개 API 함수 4개(getInstantUserFromCookies, getTokenExpiry, isTokenExpiringSoon, getTokenRemainingMs)는 jwt-parser-core/source에 의존하는 조합 함수. `jwt-parser.ts` barrel에서 직접 구현하거나 별도 파일로 분리. 실제로는 barrel을 ~60줄로 만들어 이 4개 함수를 직접 포함 가능.

### 외부 import 영향
- `auth-store-auth.ts`: 2개 dynamic import `await import('@/utils/jwt-parser')` — barrel 경로 불변
- `getInstantUserFromCookies`, `getTokenExpiry`, `isTokenExpiringSoon` — 모두 barrel에서 re-export

---

## 2. useRetryableQuery.ts (588줄 → 3파일)

### 새 파일 트리
```
hooks/
├── useRetryableQuery.ts           (~220줄) 핵심 훅 + barrel re-export
├── retryable-query-types.ts       (~70줄) 내부 useMutation + 인터페이스
└── retryable-query-presets.ts     (~270줄) 8개 특화 훅
```

### 심볼 이동맵

**`retryable-query-types.ts`** (신규, ~70줄) — 타입 + 내부 유틸:
- `UseQueryOptions<T>` interface (lines 11-15)
- `UseMutationOptions<T, TError, TVariables>` interface (lines 17-22)
- `useMutation<T, TError, TVariables>()` 내부 훅 (lines 25-56)
- `RetryableQueryOptions<T>` interface (lines 72-82)
- `RetryableMutationOptions<T, V>` interface (lines 87-90)
- `RetryableQueryResult<T>` interface (lines 95-103)

**`retryable-query-presets.ts`** (신규, ~270줄) — 8개 특화 훅:
- `useNetworkQuery<T>(queryKey, url, options)` (lines 332-361)
- `useSupabaseQuery<T>(queryKey, queryFn, options)` (lines 366-406)
- `useVoteQuery<T>(queryKey, queryFn, options)` (lines 411-433)
- `useVoteMutation<T, V>(mutationFn, options)` (lines 438-457)
- `useAuthQuery<T>(queryKey, queryFn, options)` (lines 462-480)
- `useRealtimeQuery<T>(queryKey, queryFn, options)` (lines 485-520)
- `useFileUploadQuery<T>(queryKey, uploadFn, options)` (lines 525-549)
- `useSafeRetryableQuery<T>(queryKey, queryFn, options)` (lines 554-589)
- `useRetryableQuery`, `useRetryableMutation` import from `./useRetryableQuery`
- 타입 import from `./retryable-query-types`

**`useRetryableQuery.ts`** (수정, ~220줄):
- `retryable-query-types`에서 타입 + useMutation import
- `useRetryableQuery<T>()` 핵심 훅 (lines 111-296, 186줄)
- `useRetryableMutation<T, V>()` (lines 301-327, 27줄)
- Barrel re-export: `export * from './retryable-query-types'`, `export * from './retryable-query-presets'`

### 외부 import 영향
- `hooks/index.ts`: `export { useRetryableQuery } from './useRetryableQuery'` — 경로 불변
- `hooks/useVoteResults.ts`: `import { useNetworkQuery } from './useRetryableQuery'` — barrel에서 re-export

---

## 3. not-found.tsx (534줄 → 3파일)

### 새 파일 트리
```
app/[lang]/
├── not-found.tsx              (~270줄) 메인 컴포넌트
├── not-found-data.ts          (~120줄) 언어 데이터 + 번역
└── NotFoundDecorations.tsx    (~150줄) 배경 애니메이션 + CSS
```

### 심볼 이동맵

**`not-found-data.ts`** (신규, ~120줄) — 순수 데이터, React 의존 없음:
- `languages` 배열 (lines 19-32, 12개 언어)
- `translations` 객체 (lines 35-132, 12개 언어 × 6키)
- `isValidLanguage(lang)` 타입 가드 (lines 135-137)

**`NotFoundDecorations.tsx`** (신규, ~150줄) — 'use client' 컴포넌트:
- `<style jsx>` 블록: bounce, float, twinkle 애니메이션 (lines 186-223)
- 배경 원형 그라데이션 4개 (lines 240-291)
- 반짝이는 이모지 5개 (lines 293-348)
- Props: `children: React.ReactNode` (children으로 메인 콘텐츠 래핑)

**`not-found.tsx`** (수정, ~270줄):
- `not-found-data`에서 `languages`, `translations`, `isValidLanguage` import
- `NotFoundDecorations`에서 배경 컴포넌트 import
- 컴포넌트 로직 (params, router, handlers) 유지 (lines 139-183)
- JSX: `<NotFoundDecorations>` 래핑 + 메인 콘텐츠 (404, 제목, 언어 선택기, 버튼)
- `export default` 유지 — Next.js 라우팅 계약 보존

### 외부 import 영향
- Next.js convention 파일 — 외부에서 import하지 않음
- `export default` 유지 필수

---

## 실행 순서

3개 파일은 완전 독립적. 순차 실행:

1. **jwt-parser.ts** — `jwt-parser-core.ts` → `jwt-parser-source.ts` → `jwt-parser-debug.ts` → barrel 전환
2. **useRetryableQuery.ts** — `retryable-query-types.ts` → `retryable-query-presets.ts` → 슬림화
3. **not-found.tsx** — `not-found-data.ts` → `NotFoundDecorations.tsx` → 슬림화

각 단계 완료 후 검증:
```bash
cd picnic-web && npx tsc --noEmit
cd picnic-web && npm run build
```

## 최종 줄 수 요약

| 파일 | Before | After (메인) | 신규 파일 수 | 총계 |
|------|--------|-------------|-------------|------|
| jwt-parser.ts | 616 | ~60 barrel | 3 | ~540 |
| useRetryableQuery.ts | 588 | ~220 | 2 | ~560 |
| not-found.tsx | 534 | ~270 | 2 | ~540 |

모든 메인 파일이 300줄 이하. 추출된 파일도 270줄 이하.

## 리스크

| 리스크 | 대응 |
|--------|------|
| dynamic import 경로 (`await import('@/utils/jwt-parser')`) | barrel 파일이 동일 경로에 유지 |
| `hooks/index.ts` barrel re-export 체인 | useRetryableQuery.ts에서 presets 재수출 |
| `<style jsx>` 컴포넌트 분리 | NotFoundDecorations에 jsx style 포함 |
| window 전역 등록 (`debugJWT`) | jwt-parser-debug.ts 모듈 초기화 시 실행, barrel import로 트리거 |
