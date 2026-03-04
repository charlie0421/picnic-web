# Weekly Refactor Batch 11 Plan

## Target Files

| File | Lines | Category |
|------|:-----:|----------|
| `lib/supabase/client.ts` | 413 | Supabase Client Singleton |
| `app/[lang]/(main)/goong-hap/page.tsx` | 396 | Page Component |
| `app/api/payment/portone/verify/route.ts` | 394 | API Route |

## Hard Constraints

- Behavior-preserving: 기존 동작 100% 유지
- 공개 API/export 변경 금지
- 새 의존성 금지
- 순환 의존성 금지
- 모든 파일 300줄 이하

---

## 1. supabase/client.ts (413줄 → 2파일)

### 분석
- 상단 (lines 1-228): 상수, 디버그 함수, 헬퍼 함수, singleton 상태, rate limit 처리, custom fetch
- 하단 (lines 230-413): `createBrowserSupabaseClient`, `getCurrentUser`, `getCurrentSession`, `signOut`, re-exports
- 14개 consumer 모두 `@/lib/supabase/client`에서 import
- 'use client' 지시문 필수

### 새 파일 트리
```
lib/supabase/
├── client.ts                (~220줄) 공개 API + createBrowserSupabaseClient + barrel
└── client-internals.ts      (~200줄) 내부 헬퍼, 상태, rate limit, custom fetch
```

### 심볼 이동맵

**`client-internals.ts`** (신규, ~200줄, 'use client'):
- `supabaseDebug`, `debugLog`, `debugWarn` 디버그 유틸
- `BrowserSupabaseClient` 타입 alias
- Singleton 상태: `browserSupabase`, `isCreatingClient`, `isHandlingRateLimit`, `autoRefreshState`, `autoRefreshSubscription`
- 상수: `AUTH_REFRESH_ENDPOINT`, `RATE_LIMIT_THROTTLE_WINDOW_MS`, `lastRateLimitHandledAt`
- 순수 헬퍼: `getSupabaseProjectId`, `getSupabaseAuthStorageKey`, `hasValidRefreshToken`, `readStoredRefreshToken`, `hasPersistedRefreshToken`
- Auth refresh 관리: `updateAutoRefreshBehavior`, `ensureAutoRefreshListener`
- Fetch 헬퍼: `resolveRequestUrl`, `getBodyAsString`, `isRefreshTokenRequest`
- Rate limit: `triggerSupabaseRefreshRateLimitHandling`
- Custom fetch: `supabaseAuthFetch`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` 환경변수
- 디버그 초기 로그 블록

Note: `browserSupabase`와 `isCreatingClient`는 export 필요 (client.ts에서 읽기/쓰기)

**`client.ts`** (수정, ~220줄):
- 'use client' 유지
- `client-internals`에서 필요한 것들 import
- `createBrowserSupabaseClient` 함수 유지 (singleton 로직은 내부 상태 접근 필요)
- `getCurrentUser`, `getCurrentSession` 유지
- `signOut` wrapper 유지
- re-exports: `simpleSignOut`, `emergencySignOut`, `getLogoutStatus`, `resetLogoutStatus`

### 외부 import 영향
- 14개 consumer 모두 `@/lib/supabase/client` → 변경 없음

### 순환 의존성 리스크
- `client-internals.ts` → `./events`, `./sign-out` (기존 의존)
- `client.ts` → `./client-internals`, `./sign-out`, `./debug-tools`
- `client-internals.ts`에서 `signOut` 호출 필요 (triggerSupabaseRefreshRateLimitHandling)
  → **해결**: `signOut` 콜백을 `client-internals`에 setter로 주입
  ```ts
  // client-internals.ts
  let signOutCallback: (() => Promise<any>) | null = null;
  export function setSignOutCallback(fn: () => Promise<any>) { signOutCallback = fn; }
  // triggerSupabaseRefreshRateLimitHandling에서 signOutCallback?.() 호출

  // client.ts
  import { setSignOutCallback } from './client-internals';
  setSignOutCallback(() => signOut());
  ```

---

## 2. goong-hap/page.tsx (396줄 → 2파일)

### 분석
- 상단 (lines 1-177): 타입, 상수, 데이터 fetch effect, 헬퍼 함수
- 하단 (lines 180-396): JSX 렌더링 (~216줄)
- 단일 `export default GoongHapPage`
- Consumer: Next.js 라우팅 (import 없음)

### 새 파일 트리
```
app/[lang]/(main)/goong-hap/
├── page.tsx                 (~230줄) 컴포넌트 + JSX
└── useGoongHapList.ts       (~170줄) 데이터 fetch 훅 + 타입/헬퍼
```

### 심볼 이동맵

**`useGoongHapList.ts`** (신규, ~170줄):
- `GoonghapStatus` type
- `GoonghapListItem` interface
- `localeToDbLanguage(locale)` 순수 함수
- `useGoongHapList()` 커스텀 훅:
  - 모든 useState (loading, error, results)
  - Supabase 데이터 fetch useEffect (lines 68-157)
  - `getLocalizedI18n`, `getArtistName` 헬퍼 (현재 컴포넌트 내부)
  - `hasResults` useMemo
  - 반환: `{ loading, error, results, hasResults, getLocalizedI18n, getArtistName, dbLanguage }`

**`page.tsx`** (수정, ~230줄):
- 'use client' 유지
- `useGoongHapList()` import
- JSX만 남김: intro popup, header, loading/error/results/login prompt/empty state

### 외부 import 영향
- `export default GoongHapPage` 유지 — Next.js 라우팅 계약 보존

---

## 3. portone/verify/route.ts (394줄 → 2파일)

### 분석
- 헬퍼 함수 (lines 1-151): 타입, 상수, PortOne SDK, JWT 파싱, 쿠키 처리
- POST 핸들러 (lines 153-395): 인증, 결제 검증, 영수증 처리
- **DRY 기회**: 영수증 응답 빌드 로직이 2곳에서 중복 (lines 215-274 ≈ lines 318-376)

### 새 파일 트리
```
app/api/payment/portone/verify/
├── route.ts              (~220줄) POST 핸들러 (DRY 적용)
└── verify-helpers.ts     (~180줄) 타입, 상수, 헬퍼 함수
```

### 심볼 이동맵

**`verify-helpers.ts`** (신규, ~180줄):
- `PortOneV2PaymentResponse` interface
- `PORTONE_API_SECRET`, `paymentClient` 상수
- `verifyPortOnePayment(paymentId)` 함수
- `decodeJWTPayload(token)` 함수
- `getAccessTokenFromCookies(request)` 함수
- `isTokenValidWithoutRefresh(request)` 함수
- **NEW** `buildReceiptResponse(supabase, receiptId, productId, userId)` — 중복 영수증 응답 빌드 로직 통합 (~35줄, DRY)

**`route.ts`** (수정, ~220줄):
- `verify-helpers`에서 모든 헬퍼 import
- `POST` 핸들러: 인증 → 결제 검증 → `buildReceiptResponse` 호출 (2곳 모두)
- `export async function POST` 유지

### DRY 개선 (~60줄 절감)
| 패턴 | 중복 횟수 | → |
|------|-----------|---|
| 영수증 데이터 조회 + customData 파싱 + 응답 빌드 | 2x | `buildReceiptResponse` 1x |

### 외부 import 영향
- `export async function POST` 유지 — Next.js API route 계약 보존

---

## 실행 순서

3개 파일 완전 독립. 병렬 실행:

1. **supabase/client.ts** — `client-internals.ts` 생성 → client.ts 슬림화
2. **goong-hap/page.tsx** — `useGoongHapList.ts` 생성 → page.tsx 슬림화
3. **portone/verify/route.ts** — `verify-helpers.ts` 생성 → route.ts 슬림화 + DRY

검증:
```bash
cd picnic-web && npx tsc --noEmit
cd picnic-web && npx madge --circular --extensions ts,tsx .
cd picnic-web && VERCEL=1 npm run build
```

## 최종 줄 수 요약

| File | Before | After (Main) | New Files | Total |
|------|--------|-------------|-----------|-------|
| supabase/client.ts | 413 | ~220 | 1 (~200) | ~420 |
| goong-hap/page.tsx | 396 | ~230 | 1 (~170) | ~400 |
| portone/verify/route.ts | 394 | ~220 | 1 (~180) | ~400 |

## 리스크

| Risk | Mitigation |
|------|------------|
| browserSupabase 싱글톤 상태 공유 | export 가능한 let 변수 + getter/setter 패턴 |
| signOut → client-internals 순환 | signOut 콜백 setter 주입으로 방지 |
| 'use client' 누락 | client-internals.ts에 필수 (window 접근) |
| JWT 파싱 보안 | verify-helpers.ts는 서버 전용, 클라이언트 노출 없음 |
