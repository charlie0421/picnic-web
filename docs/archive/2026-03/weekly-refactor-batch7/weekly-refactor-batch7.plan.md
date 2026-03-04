# Weekly Refactor Plan: Batch 7 — picnic-web 300줄+ 파일 분해

## Context

이전 배치 완료:
- Batch 1 (top3): 100% | Batch 2: 93% | Batch 3: 95% | Batch 4: 95% | Batch 5: 93% | Batch 6: 93%

이번 대상: 남은 300줄+ 파일 중 실전 코드 Top 3:
- `utils/api/queries.ts` (491줄)
- `utils/logger.ts` (485줄)
- `app/not-found.tsx` (477줄)

**Hard Constraints**: behavior-preserving, 공개 API 변경 금지, 새 의존성 금지, 순환 의존성 금지.

---

## 1. queries.ts (491줄 → 4파일)

### 새 파일 트리
```
utils/api/
├── queries.ts              (~40줄) barrel — withRetry 래핑 + re-export
├── queries-helpers.ts      (~65줄) 상수 + 폴백 데이터 + 유틸 함수
├── queries-vote.ts         (~220줄) 투표 관련 쿼리 4개
└── queries-content.ts      (~175줄) 콘텐츠 관련 쿼리 5개
```

### 심볼 이동맵

**`queries-helpers.ts`** (신규, ~65줄) — 순수 상수/유틸:
- `SUPABASE_TIMEOUT_MS` const (line 5)
- `GET_REWARDS_TIMEOUT_MS` const (line 6)
- `DEFAULT_REWARD_LIMIT` const (line 7)
- `REWARD_SELECT_COLUMNS` const (lines 8-21)
- `FALLBACK_VOTES` const (line 22)
- `FALLBACK_REWARDS` const (lines 23-41)
- `withTimeout<T>()` function (lines 43-58)
- `logRequestError()` function (lines 62-65)
- Import: `Vote, Reward` from `@/types/interfaces`
- 모두 export

**`queries-vote.ts`** (신규, ~220줄) — 투표 쿼리:
- `_getVotes()` (lines 68-152, 85줄)
- `_getVoteById()` (lines 327-362, 36줄)
- `_getVoteItems()` (lines 365-400, 36줄)
- `_getVoteRewards()` (lines 403-441, 39줄)
- Import: `createPublicSupabaseClient` from `@/lib/supabase/server`
- Import: `Vote, VoteItem, Reward` from `@/types/interfaces`
- Import: `withTimeout`, `logRequestError`, `FALLBACK_VOTES` from `./queries-helpers`
- 모두 export

**`queries-content.ts`** (신규, ~175줄) — 콘텐츠 쿼리:
- `_getRewards()` (lines 155-210, 56줄)
- `_getBanners()` (lines 213-241, 29줄)
- `_getRewardById()` (lines 244-294, 51줄)
- `_getMedias()` (lines 297-324, 28줄)
- `_getPopups()` (lines 444-480, 37줄)
- Import: `createPublicSupabaseClient` from `@/lib/supabase/server`
- Import: `Banner, Media, Reward, Popup` from `@/types/interfaces`
- Import: `withRetry` from `./retry-utils`
- Import: `withTimeout`, `logRequestError`, `FALLBACK_REWARDS`, `DEFAULT_REWARD_LIMIT`, `REWARD_SELECT_COLUMNS`, `GET_REWARDS_TIMEOUT_MS` from `./queries-helpers`
- 모두 export

**`queries.ts`** (수정, ~40줄) — barrel:
- `_getVotes`, `_getVoteById`, `_getVoteItems`, `_getVoteRewards` from `./queries-vote`
- `_getRewards`, `_getBanners`, `_getRewardById`, `_getMedias`, `_getPopups` from `./queries-content`
- withRetry 래핑 후 export (lines 483-491 유지)

### 외부 import 영향
- 9개 소비자 모두 `from '@/utils/api/queries'` — barrel 경로 불변

---

## 2. logger.ts (485줄 → 4파일)

### 새 파일 트리
```
utils/
├── logger.ts               (~190줄) Logger 클래스 + singleton + barrel
├── logger-types.ts         (~60줄) enum + interfaces
├── logger-targets.ts       (~120줄) 3개 LogTarget 구현 클래스
└── logger-utils.ts         (~120줄) createRequestLogger + PerformanceTimer + 헬퍼
```

### 심볼 이동맵

**`logger-types.ts`** (신규, ~60줄) — 타입 정의:
- `LogLevel` enum (lines 13-19)
- `LogEntry` interface (lines 24-51)
- `LogTarget` interface (lines 56-59)
- Import: 없음 (순수 타입)
- 모두 export

**`logger-targets.ts`** (신규, ~120줄) — 로그 타겟 구현:
- `ConsoleLogTarget` class (lines 64-100)
- `SupabaseLogTarget` class (lines 105-134)
- `ExternalMonitoringTarget` class (lines 139-177)
- Import: `LogLevel`, `LogEntry`, `LogTarget` from `./logger-types`
- Import: `createServerActionClient` from `@/utils/supabase-server-client`
- 모두 export

**`logger-utils.ts`** (신규, ~120줄) — 유틸리티:
- `createRequestLogger()` function (lines 375-412)
- `PerformanceTimer` class (lines 417-457)
- `startTimer()` function (lines 462-464)
- `withLogging()` decorator (lines 469-486)
- Import: `Logger`, `logger` from `./logger`
- Import: `AppError` from `@/utils/error`
- 모두 export

**`logger.ts`** (수정, ~190줄) — 핵심 클래스 + barrel:
- `Logger` class (lines 182-365) — constructor, addTarget, removeTarget, writeLog, debug, info, warn, error, fatal, logAppError
- `logger` singleton (line 370)
- barrel re-exports from `./logger-types`, `./logger-targets`, `./logger-utils`
- Import: `LogLevel`, `LogEntry`, `LogTarget` from `./logger-types`
- Import: `ConsoleLogTarget`, `SupabaseLogTarget` from `./logger-targets`
- Import: `AppError`, `ErrorSeverity` from `@/utils/error`

### 외부 import 영향
- 7개 소비자 모두 `from '@/utils/logger'` — barrel 경로 불변

---

## 3. app/not-found.tsx (477줄 → 3파일)

### 새 파일 트리
```
app/
├── not-found.tsx                   (~250줄) 메인 컴포넌트
├── not-found-data.ts               (~125줄) 언어 데이터 + 번역
└── GlobalNotFoundDecorations.tsx    (~105줄) 배경 애니메이션
```

### 심볼 이동맵

**`not-found-data.ts`** (신규, ~125줄) — 순수 데이터, React 의존 없음:
- `languages` 객체 (lines 13-26, 12개 언어)
- `translations` 객체 (lines 28-125, 12개 언어 × 6키)
- `Language` type: `keyof typeof languages`
- 모두 export

**`GlobalNotFoundDecorations.tsx`** (신규, ~105줄) — 'use client' 컴포넌트:
- `<style jsx>` 블록: pulse, float, sparkle 애니메이션 (lines 460-475)
- 반짝이는 이모지 5개 (lines 251-264)
- 떠다니는 도형 6개 (lines 268-284)
- Props: `children: React.ReactNode`

**`not-found.tsx`** (수정, ~250줄):
- `not-found-data`에서 `languages`, `translations` import
- `GlobalNotFoundDecorations`에서 배경 컴포넌트 import
- 컴포넌트 로직 유지 (useState, useEffect, handlers)
- JSX: `<GlobalNotFoundDecorations>` 래핑 + 메인 콘텐츠 (404, 제목, 설명, 언어 선택기, 버튼)
- `export default` 유지 — Next.js 라우팅 계약 보존

### 외부 import 영향
- Next.js convention 파일 — 외부에서 import하지 않음
- `export default` 유지 필수

---

## 실행 순서

3개 파일은 완전 독립적. 순차 실행:

1. **queries.ts** — `queries-helpers.ts` → `queries-vote.ts` → `queries-content.ts` → barrel 전환
2. **logger.ts** — `logger-types.ts` → `logger-targets.ts` → `logger-utils.ts` → 슬림화
3. **not-found.tsx** — `not-found-data.ts` → `GlobalNotFoundDecorations.tsx` → 슬림화

각 단계 완료 후 검증:
```bash
cd picnic-web && npx tsc --noEmit
cd picnic-web && npx madge --circular [files]
```

## 최종 줄 수 요약

| 파일 | Before | After (메인) | 신규 파일 수 | 총계 |
|------|--------|-------------|-------------|------|
| queries.ts | 491 | ~40 barrel | 3 | ~500 |
| logger.ts | 485 | ~190 | 3 | ~490 |
| not-found.tsx | 477 | ~250 | 2 | ~480 |

모든 메인 파일이 300줄 이하. 추출된 파일도 250줄 이하.

## 리스크

| 리스크 | 대응 |
|--------|------|
| queries barrel의 withRetry 래핑 | barrel에서 래핑 유지 — 내부 함수는 _ prefix로 export |
| logger-utils → logger 순환 의존성 | logger-utils가 Logger class + singleton을 import → 단방향 |
| `<style jsx>` 분리 후 animation 참조 | GlobalNotFoundDecorations에 style jsx 포함, children으로 메인 콘텐츠 래핑 |
| app/not-found-data.ts vs app/[lang]/not-found-data.ts 중복 | 별도 파일 유지 — cross-directory import 지양 |
| `export default` 보존 | not-found.tsx default export 유지 |
