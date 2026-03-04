# Weekly Refactor Batch 12 Plan

## Target Files

| File | Lines | Category |
|------|:-----:|----------|
| `components/client/vote/detail/VoteDetailPresenter.tsx` | 386 | Vote Detail Component |
| `lib/data-fetching/server/vote-service.ts` | 385 | Server Data Service |
| `utils/api/enhanced-retry-utils.ts` | 381 | Retry/Circuit Breaker Utils |

## Hard Constraints

- Behavior-preserving: 기존 동작 100% 유지
- 공개 API/export 변경 금지
- 새 의존성 금지
- 순환 의존성 금지
- 모든 파일 300줄 이하

---

## 1. VoteDetailPresenter.tsx (386줄 → 2파일)

### 분석
- 상단 (lines 1-29): imports, type re-export
- 중간 (lines 30-181): 컴포넌트 본체 — 훅 초기화, 상태, 이벤트 핸들러, useMemo
- 하단 (lines 182-386): JSX 렌더링 (헤더, 검색, 포디움, 카드 그리드, 모달, 디버거)

### 새 파일 트리
```
components/client/vote/detail/
├── VoteDetailPresenter.tsx      (~230줄) 컴포넌트 + JSX (handleCardClick/confirmVote 인라인)
└── useVoteDetail.ts             (~160줄) 상태 관리 + useMemo + 헬퍼
```

### 심볼 이동맵

**`useVoteDetail.ts`** (신규, ~160줄):
- `useVoteDetail(props)` 커스텀 훅:
  - `useLanguageStore`, `useRequireAuth`, `useWithdrawalGuard` 훅 호출
  - `useVotePolling` 호출
  - `selectedItem`, `searchQuery`, `isVoting`, `timeLeft`, `showVoteModal`, `voteCandidate`, `voteAmount`, `availableVotes`, `headerHeight` useState
  - `headerRef` useRef
  - `voteStatus`, `canVote`, `debouncedSearchQuery` 파생값
  - headerHeight useEffect
  - `handleCardClick`, `confirmVote`, `cancelVote`, `handleSearch` 핸들러
  - `rankedVoteItems`, `filteredItems`, `totalVotes` useMemo
  - `formatVotePeriod`, `renderTimer` 헬퍼
  - 반환: 모든 상태/핸들러/컴퓨티드 값

**`VoteDetailPresenter.tsx`** (수정, ~230줄):
- 'use client' 유지
- `useVoteDetail` import
- JSX만 남김: sticky 헤더, 검색, 포디움, 카드 그리드, VoteDialog, VoteNotifications, rewards, 디버거
- `export type { VoteDetailPresenterProps }` 유지
- `export default VoteDetailPresenter` 유지

### 외부 import 영향
- `VoteDetailPresenterProps` re-export 유지 — 3개 consumer 변경 없음

---

## 2. vote-service.ts (385줄 → 2파일)

### 분석
- 상단 (lines 1-120): 타입, SELECT 상수, `transformVoteData`, 쿼리 빌더 (`buildVoteQuery`)
- 하단 (lines 121-385): `getVotes`, `getVoteById`, `getVoteDetails` 캐시 함수

### 새 파일 트리
```
lib/data-fetching/server/
├── vote-service.ts            (~210줄) 공개 API 함수 3개
└── vote-service-query.ts      (~180줄) 타입, SELECT 상수, transformVoteData, buildVoteQuery
```

### 심볼 이동맵

**`vote-service-query.ts`** (신규, ~180줄):
- `import 'server-only'` (서버 전용 모듈)
- `VoteWithRelations` type (export)
- `VOTE_LIST_SELECT` 상수 (export)
- `VOTE_DETAIL_SELECT` 상수 (export)
- `transformVoteData(data)` 함수 (export)
- `VoteOrderConfig` type
- `getVoteOrderConfig(status)` 함수 (export)
- `buildVoteQuery(client, status, area)` 함수 (export)

**`vote-service.ts`** (수정, ~210줄):
- `import 'server-only'` 유지
- `vote-service-query`에서 필요한 것들 import
- `getVotes` (cache) — 기존 로직 유지
- `getVoteById` (cache) — 기존 로직 유지
- `getVoteDetails` (cache) — 기존 로직 유지

### 외부 import 영향
- 4개 consumer 모두 `vote-service`에서 import → 변경 없음

---

## 3. enhanced-retry-utils.ts (381줄 → 2파일)

### 분석
- 상단 (lines 1-108): CircuitBreaker 클래스, 타입, 기본 설정
- 중간 (lines 109-252): withEnhancedRetry, shouldRetry, withProfileOptimization, withVoteOptimization, getCircuitBreakerStats
- 하단 (lines 253-381): RequestQueue, withRequestQueue, PerformanceMetrics, withPerformanceMonitoring

### 새 파일 트리
```
utils/api/
├── enhanced-retry-utils.ts        (~200줄) withEnhancedRetry, 도메인별 래퍼, 내보내기
└── enhanced-retry-internals.ts    (~185줄) CircuitBreaker, RequestQueue, PerformanceMetrics 클래스
```

### 심볼 이동맵

**`enhanced-retry-internals.ts`** (신규, ~185줄):
- `CircuitState` enum (export)
- `CircuitBreaker` class (export)
- `CircuitBreakerOptions` interface (export)
- `DEFAULT_CIRCUIT_OPTIONS` 상수 (export)
- `globalCircuitBreaker` 인스턴스 (export)
- `RequestQueue` class (export)
- `globalRequestQueue` 인스턴스 (export)
- `PerformanceMetrics` class (export — 기존 공개 API)
- `calculateDelayWithJitter` 함수 (export)
- `shouldRetry` 함수 (export)

**`enhanced-retry-utils.ts`** (수정, ~200줄):
- `enhanced-retry-internals`에서 import
- `EnhancedRetryOptions` interface
- `DEFAULT_ENHANCED_OPTIONS` 상수
- `withEnhancedRetry` 함수 (export)
- `withProfileOptimization` 함수 (export)
- `withVoteOptimization` 함수 (export)
- `getCircuitBreakerStats` 함수 (export)
- `withRequestQueue` 함수 (export)
- `withPerformanceMonitoring` 함수 (export)
- Barrel re-export: `export { PerformanceMetrics } from './enhanced-retry-internals'`

### 외부 import 영향
- 1개 consumer (`vote-api-enhanced.ts`)가 `enhanced-retry-utils`에서 import → 변경 없음

---

## 실행 순서

3개 파일 완전 독립. 병렬 실행:

1. **VoteDetailPresenter.tsx** — `useVoteDetail.ts` 생성 → 컴포넌트 슬림화
2. **vote-service.ts** — `vote-service-query.ts` 생성 → 서비스 슬림화
3. **enhanced-retry-utils.ts** — `enhanced-retry-internals.ts` 생성 → 유틸 슬림화

검증:
```bash
cd picnic-web && npx tsc --noEmit
cd picnic-web && npx madge --circular --extensions ts,tsx .
cd picnic-web && VERCEL=1 npm run build
```

## 최종 줄 수 요약

| File | Before | After (Main) | New Files | Total |
|------|--------|-------------|-----------|-------|
| VoteDetailPresenter.tsx | 386 | ~230 | 1 (~160) | ~390 |
| vote-service.ts | 385 | ~210 | 1 (~180) | ~390 |
| enhanced-retry-utils.ts | 381 | ~200 | 1 (~185) | ~385 |

## 리스크

| Risk | Mitigation |
|------|------------|
| renderTimer가 JSX 반환 — 훅에서 사용 가능? | renderTimer는 훅 반환값으로 함수 제공, JSX 내에서 호출 |
| useVotePolling 의존성 복잡 | 훅에서 원본 의존성 배열 그대로 복사 |
| 'server-only' import 누락 | vote-service-query.ts에 필수 |
| globalCircuitBreaker 싱글톤 공유 | 단일 모듈에서 생성, export로 공유 |
