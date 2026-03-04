# Weekly Refactor Plan: picnic-web Batch 3 — 300줄+ 파일 분해

## Context

Batch 1 (supabase-service 1,359줄, client 1,129줄, auth-provider 1,043줄) 완료 — 100% match.
Batch 2 (image-utils 1,009줄, VoteDetailPresenter 817줄, GoongHapDetailClient 802줄) 완료 — 93% match.

이번 Batch 3 대상:
- `lib/supabase/auth-store.ts` (794줄)
- `utils/error.ts` (788줄)
- `utils/date.ts` (683줄)

**Hard Constraints**: behavior-preserving, 공개 API 변경 금지, 새 의존성 금지, 순환 의존성 금지.

---

## 1. auth-store.ts (794줄 → 4파일)

### 현재 구조
싱글톤 `AuthStore` 클래스 — constructor에서 JWT 파싱, 네트워크 폴백, 토큰 만료 감지, 프로필 로딩, 로그아웃까지 모두 처리.

### 외부 소비자
- `lib/supabase/auth-provider.tsx` — `import { AuthStore, type AuthContextType } from './auth-store'` (유일한 소비자)

### 새 파일 트리
```
lib/supabase/
├── auth-store.ts              (~200줄) 클래스 셸 + 상태 관리 + 팩토리
├── auth-store-types.ts         (~50줄) AuthContextType + 디버그 유틸
├── auth-store-auth.ts          (~280줄) performInstantUserAuth + checkTokenStatus
└── auth-store-profile.ts       (~150줄) loadUserProfile + signOut
```

### 심볼 이동맵

**`auth-store-types.ts`** (신규, ~50줄) — 타입 + 디버그 유틸:
- `AuthContextType` interface
- `authDebug` 상수
- `debugLog()`, `debugWarn()` 함수

**`auth-store-auth.ts`** (신규, ~280줄) — 인증 로직:
- `performInstantUserAuth(store)` — JWT 파싱 + 네트워크 폴백 (359-600줄, 242줄)
- `checkTokenStatusFromCookies(store)` — 쿠키 기반 토큰 상태 체크 (602-639줄, 38줄)
- `this` 접근 → `store` 파라미터로 AuthStore 인스턴스 주입

**`auth-store-profile.ts`** (신규, ~150줄) — 프로필 + 로그아웃:
- `signOutImpl(store)` — 로그아웃 로직 (284-357줄, 74줄)
- `loadUserProfileImpl(store, userId)` — 프로필 로딩 + 재시도 + 개발환경 폴백 (641-793줄, 153줄)
- `this` 접근 → `store` 파라미터로 AuthStore 인스턴스 주입

**`auth-store.ts`** (수정, ~200줄):
- `AuthStore` 클래스 셸: constructor, getInstance(), subscribe(), getState(), waitForInitialization()
- 내부 접근자 메서드 노출: `getSupabaseClient()`, `getProfileLoadPromises()`, `getIsAuthEvaluating()` 등
- private 메서드들은 추출된 함수를 위임 호출:
  ```ts
  private async performInstantUserAuth() { return performInstantUserAuthImpl(this); }
  private async signOut() { return signOutImpl(this); }
  private async loadUserProfile(userId) { return loadUserProfileImpl(this, userId); }
  ```
- constructor의 onAuthStateChange 리스너, initialize() 유지 (인라인)

### 외부 import 영향
- `auth-provider.tsx`의 `import { AuthStore, type AuthContextType } from './auth-store'` — 경로 불변
- `AuthContextType`은 `auth-store.ts`에서 `auth-store-types.ts`를 re-export

---

## 2. error.ts (788줄 → 4파일 barrel)

### 현재 구조
8개 클래스/enum + 30+ export. 논리적으로 분리 가능한 4개 도메인:
1. 핵심 타입 + AppError 클래스
2. SocialAuthError + SocialAuthErrorCode
3. DataFetchingError + DataFetchingErrorType
4. ErrorTransformer + ErrorHandler + RetryUtility + 편의 함수

### 외부 소비자 (12개 파일)
주로 사용하는 심볼: `AppError`, `ErrorCategory`, `ErrorSeverity`, `ErrorHandler`, `createContext`, `RetryConfig`, `ErrorContext`

### 새 파일 트리
```
utils/
├── error.ts                  (~30줄) barrel re-export
├── error/
│   ├── core.ts               (~200줄) enums + interfaces + AppError + DEFAULT_RETRY_CONFIG
│   ├── social-auth-error.ts  (~120줄) SocialAuthErrorCode + SocialAuthError
│   ├── data-fetching-error.ts (~70줄) DataFetchingErrorType + DataFetchingError
│   └── handlers.ts           (~290줄) PG_ERROR_MAPPING + ErrorTransformer + ErrorHandler + RetryUtility + ErrorContextBuilder + createError + createContext + legacy 함수
```

### 심볼 이동맵

**`error/core.ts`** (신규, ~200줄) — 핵심 타입:
- `ErrorCategory` enum (1-26줄)
- `ErrorSeverity` enum (28-36줄)
- `ErrorContext` interface (38-49줄)
- `RetryConfig` interface (51-60줄)
- `DEFAULT_RETRY_CONFIG` const (62-71줄)
- `AppError` class (76-195줄)

**`error/social-auth-error.ts`** (신규, ~120줄):
- `SocialAuthErrorCode` enum (200-217줄)
- `SocialLoginProvider` type (222줄)
- `SocialAuthError` class (227-313줄)
- import: `AppError`, `ErrorCategory`, `ErrorSeverity`, `ErrorContext` from `./core`

**`error/data-fetching-error.ts`** (신규, ~70줄):
- `DataFetchingErrorType` enum (318-326줄)
- `DataFetchingError` class (331-396줄)
- import: `AppError`, `ErrorCategory`, `ErrorSeverity`, `ErrorContext` from `./core`

**`error/handlers.ts`** (신규, ~290줄):
- `PG_ERROR_MAPPING` const (403-427줄)
- `ErrorTransformer` class (432-546줄)
- `ErrorLogger` interface + `ConsoleErrorLogger` class (548-577줄)
- `RetryUtility` class (582-623줄)
- `ErrorHandler` class (628-686줄)
- `ErrorContextBuilder` class (691-730줄)
- `createError` object (739-766줄)
- `createContext` function (771줄)
- `handleSupabaseError`, `handleError` deprecated 함수 (780-788줄)
- import: 모든 core + social-auth-error + data-fetching-error에서 필요한 타입

**`error.ts`** (수정 → barrel, ~30줄):
```ts
export { ErrorCategory, ErrorSeverity, AppError, DEFAULT_RETRY_CONFIG } from './error/core';
export type { ErrorContext, RetryConfig } from './error/core';
export { SocialAuthErrorCode, SocialAuthError } from './error/social-auth-error';
export type { SocialLoginProvider } from './error/social-auth-error';
export { DataFetchingErrorType, DataFetchingError } from './error/data-fetching-error';
export {
  ErrorTransformer, ConsoleErrorLogger, RetryUtility, ErrorHandler,
  ErrorContextBuilder, createError, createContext,
  handleSupabaseError, handleError,
} from './error/handlers';
export type { ErrorLogger } from './error/handlers';
```

### 외부 import 영향
- 12개 소비자 모두 `@/utils/error` 경로 사용 → barrel re-export로 경로 불변
- 모든 기존 import 심볼이 barrel에서 re-export됨

---

## 3. date.ts (683줄 → 4파일 barrel)

### 현재 구조
17개 exported 함수/상수. 논리적으로 분리 가능한 3개 도메인:
1. 타입 + 상수 + locale 맵 (i18n 데이터)
2. 시간대 관리 (캐싱, 감지, 변경 감시)
3. 날짜 포맷터 (절대/상대/스마트)

### 외부 소비자 (7개 파일)
주로 사용: `formatVotePeriodWithTimeZone`, `formatRelativeTime`, `formatSimpleDateWithTimeZone`, `getCurrentLocale`, `SupportedLanguage`, `formatDateWithTimeZone`, `formatSmartDate`

### 새 파일 트리
```
utils/
├── date.ts                    (~30줄) barrel re-export
├── date/
│   ├── date-constants.ts      (~200줄) 타입 + 상수 + locale 맵 + 상대시간 포맷
│   ├── timezone.ts            (~180줄) 캐시 + getUserTimeZone + getTimeZoneCode + watchTimeZoneChange + clearTimeZoneCaches
│   └── formatters.ts          (~250줄) formatDateWithTimeZone + formatVotePeriod + formatSimpleDate + calculateRemainingTime + formatRelativeTime + formatSmartDate + formatPostDate + formatCommentDate
```

### 심볼 이동맵

**`date/date-constants.ts`** (신규, ~200줄) — 타입 + i18n 데이터:
- `RemainingTime` interface (7-12줄)
- `SupportedLanguage` type (15줄)
- `LOCALE_MAP` const (18-31줄)
- `DATE_FNS_LOCALE_MAP` const (33-46줄)
- `DATE_FORMAT_MAP` const (48-61줄)
- `SIMPLE_DATE_FORMAT_MAP` const (63-76줄)
- `RELATIVE_TIME_THRESHOLDS` const (79-85줄)
- `RELATIVE_TIME_FORMATS` const (88-199줄)
- `localeMap` legacy export (= DATE_FNS_LOCALE_MAP)

**`date/timezone.ts`** (신규, ~180줄) — 시간대 관리:
- 캐싱 변수: `cachedUserTimeZone`, `lastTimeZoneCheck`, `timeZoneCodeCache`, `intlFormatterCache` (203-207줄)
- 시간 상수: `TIMEZONE_CACHE_TTL`, `TIMEZONE_CHECK_DEBOUNCE`, `TIMEZONE_WATCH_INTERVAL` (210-212줄)
- `getUserTimeZone(forceRefresh)` (217-239줄)
- `getCachedIntlFormatter(timeZone, options)` (244-262줄, 내부)
- `getTimeZoneCode(timeZone, language)` (267-322줄)
- `calculateUtcOffset(timeZone)` (327-339줄, 내부)
- `watchTimeZoneChange(callback)` (344-407줄)
- `clearTimeZoneCaches()` (525-530줄)
- import: `TIMEZONE_ABBREVIATIONS` from `../timezone-data`, `DateTime` from `luxon`, `SupportedLanguage` from `./date-constants`

**`date/formatters.ts`** (신규, ~250줄) — 날짜 포맷터:
- `getCurrentLocale(language)` (419-421줄)
- `formatDateWithTimeZone(utcDate, formatString, language, timeZone, includeTimeZoneCode)` (426-457줄)
- `formatVotePeriodWithTimeZone(startDate, endDate, language, timeZone)` (462-482줄)
- `formatSimpleDateWithTimeZone(date, language, timeZone, includeTimeZoneCode)` (487-497줄)
- `calculateRemainingTime(endTime)` (502-520줄)
- `formatRelativeTime(date, language, options)` (535-621줄)
- `formatSmartDate(date, language, context)` (626-660줄)
- `formatPostDate(date, language)` (665-670줄)
- `formatCommentDate(date, language)` (675-680줄)
- import: date-fns, date-fns-tz, `date-constants`, `timezone`

**`date.ts`** (수정 → barrel, ~30줄):
```ts
export type { RemainingTime, SupportedLanguage } from './date/date-constants';
export { localeMap } from './date/date-constants';
export { getUserTimeZone, getTimeZoneCode, watchTimeZoneChange, clearTimeZoneCaches } from './date/timezone';
export {
  getCurrentLocale, formatDateWithTimeZone, formatVotePeriodWithTimeZone,
  formatSimpleDateWithTimeZone, calculateRemainingTime, formatRelativeTime,
  formatSmartDate, formatPostDate, formatCommentDate,
} from './date/formatters';
```

### 외부 import 영향
- 7개 소비자 모두 `@/utils/date` 경로 사용 → barrel re-export로 경로 불변

---

## 실행 순서

3개 파일은 완전 독립적. 순차 실행:

1. **auth-store.ts** — `auth-store-types.ts` → `auth-store-auth.ts` → `auth-store-profile.ts` → 슬림화
2. **error.ts** — `error/core.ts` → `error/social-auth-error.ts` → `error/data-fetching-error.ts` → `error/handlers.ts` → barrel
3. **date.ts** — `date/date-constants.ts` → `date/timezone.ts` → `date/formatters.ts` → barrel

각 단계 완료 후 검증:
```bash
cd picnic-web && npx tsc --noEmit
cd picnic-web && npm run build
```

## 최종 줄 수 요약

| 파일 | Before | After (메인) | 신규 파일 수 | 총계 |
|------|--------|-------------|-------------|------|
| auth-store.ts | 794 | ~200 | 3 | ~680 |
| error.ts | 788 | ~30 (barrel) | 4 | ~680 |
| date.ts | 683 | ~30 (barrel) | 3 | ~660 |

모든 메인 파일이 300줄 이하. 추출된 파일도 290줄 이하.

## 리스크

| 리스크 | 대응 |
|--------|------|
| AuthStore private 멤버 접근 | 내부 접근자 메서드(getSupabaseClient 등) + friend-module 패턴 |
| error.ts 순환 의존성 | handlers → core/social/data 단방향만 허용, 역방향 없음 |
| date.ts 모듈 상태 공유 | timezone.ts에 캐시 변수 집중, formatters는 stateless |
| barrel re-export 누락 | 기존 import 목록 대조하여 모든 심볼 포함 확인 |
| `luxon`/`date-fns` import 분산 | timezone.ts에 luxon, formatters.ts에 date-fns 집중 |
