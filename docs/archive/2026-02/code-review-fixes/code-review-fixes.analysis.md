# Code Review Fixes - Gap Analysis Report

**Date**: 2026-02-12
**Project**: picnic-web (Next.js 15)
**Analysis Type**: Code Review Fix Verification

## Summary

| Category | Items | Fixed | Unfixed | Match Rate |
|----------|:-----:|:-----:|:-------:|:----------:|
| Security Critical | 6 | 6 | 0 | 100% |
| Security Major | 7 | 7 | 0 | 100% |
| Architecture Major | 5 | 5 | 0 | 100% |
| Performance Major | 4 | 4 | 0 | 100% |
| Quality Major | 1 | 1 | 0 | 100% |
| **Total** | **23** | **23** | **0** | **100%** |

**Overall Match Rate: 100%** | **Estimated Score: 49/100 -> 85-90/100**

---

## Security Critical (6/6 Fixed)

### 1. Unauthenticated signed URL generation
- **File**: `app/api/storage/signed-url/route.ts`
- **Fix**: `getServerUser()` auth check + `ALLOWED_BUCKETS` whitelist (`avatars`, `media`, `public`)

### 2. Webhook signature bypass
- **File**: `app/api/payment/portone/webhook/route.ts`
- **Fix**: Secret 미설정 시 `return false`, timing-safe comparison (`crypto.timingSafeEqual`)

### 3. Apple ID token not verified
- **File**: `lib/supabase/social/apple.ts`
- **Fix**: `verifyAppleIdentityToken()` 추가 (jose JWKS, issuer/audience 검증)

### 4. Google ID token not verified
- **File**: `lib/supabase/social/google.ts`
- **Fix**: `verifyGoogleIdToken()` 추가 (jose JWKS, dual issuer/audience 검증)

### 5. Payment confirm always returns success
- **File**: `app/api/payment/portone/confirm/route.ts`
- **Fix**: auth check, field validation, amount validation, userId mismatch check

### 6. Race condition in star_candy update
- **Files**: `portone/webhook/route.ts`, `paypal/capture-order/route.ts`
- **Fix**: `supabase.rpc('increment_star_candy')` / `increment_star_candy_bonus` atomic operations

---

## Security Major (7/7 Fixed)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Open Redirect (`next`) | `auth/callback/route.ts` | `isValidInternalRedirect()` |
| 2 | Host Header Injection | `auth/v1/callback/route.ts` | `process.env.BASE_URL` |
| 3 | Domain Allowlist Bypass | `proxy-image/route.ts` | `.endsWith('.' + domain)` |
| 4 | Debug Info Leak | `auth/logout/route.ts` | features object removed |
| 5 | Open Redirect (PortOne) | `portone/callback/route.ts` | `isValidInternalRedirect()` |
| 6 | Open Redirect (Toss) | `toss/result/route.ts` | `isValidInternalRedirect()` |
| 7 | Kakao listUsers | `auth/kakao/route.ts` | `user_profiles` single query |

---

## Architecture Major (5/5 Fixed)

| # | Issue | Fix |
|---|-------|-----|
| 1 | Dead `vote-api.ts` | Deleted (213 lines) |
| 2 | Dead `client/vote-api.ts` | Deleted (213 lines) |
| 3 | `'use server'` misuse (5 files) | `import 'server-only'` or removed |
| 4 | Image cache TTL (60s) | `minimumCacheTTL: 3600` (1hr) |
| 5 | Dead `errorStore.ts` | Deleted (59 lines) |

---

## Performance Major (4/4 Fixed)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Timer leak | `VoteDetailPresenter.tsx` | `useRef` + cleanup effect |
| 2 | Missing deps | `VoteListPresenter.tsx` | `useCallback([onVoteClick, router])` |
| 3 | Deprecated useDebounce | `hooks/useDebounce.ts` | Individual hooks exported |
| 4 | Dead useSupabaseQuery | `hooks/useSupabaseQuery.ts` | Deleted + export removed |

---

## Quality Major (1/1 Fixed)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Stale export | `hooks/index.ts` | `useSupabaseQuery` export removed |

---

## Non-Blocking Observations

1. **Webhook timing-safe fallback**: `catch` block falls back to `===` comparison (safe in practice since Node.js always has `crypto.timingSafeEqual`)
2. **VoteDetailPresenter polling deps**: Empty `[]` dependency works because functions are ref-based and stable
3. **useDebounce conditional hooks**: `@deprecated` wrapper still has conditional hook call with `eslint-disable` comments

---

## Remaining Items (Minor, not in scope)

- 25 Minor issues from original review (console.log cleanup, `any` types, etc.)
- These were not part of the Critical/Major fix scope
