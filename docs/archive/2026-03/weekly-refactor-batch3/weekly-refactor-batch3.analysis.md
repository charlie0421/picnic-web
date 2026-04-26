# weekly-refactor-batch3 Gap Analysis

> **Match Rate: 95%** | Date: 2026-03-04 | Analyst: Claude Code

---

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| File Structure | 100% | PASS |
| Symbol Preservation | 100% | PASS |
| Barrel Re-export Completeness | 100% | PASS |
| Circular Dependency Absence | 100% | PASS |
| External Import Path Stability | 100% | PASS |
| Line Count Target Compliance | 77% | WARN |
| No New Dependencies | 100% | PASS |
| No Public API Changes | 100% | PASS |
| **Overall** | **95%** | PASS |

---

## Line Count Comparison

| File | Plan | Actual | Status |
|------|:----:|:------:|:------:|
| auth-store.ts | ~200 | 322 | OVER |
| auth-store-types.ts | ~50 | 61 | OK |
| auth-store-auth.ts | ~280 | 301 | OK (marginal) |
| auth-store-profile.ts | ~150 | 249 | OVER |
| error.ts (barrel) | ~30 | 31 | OK |
| error/core.ts | ~200 | 194 | OK |
| error/social-auth-error.ts | ~120 | 124 | OK |
| error/data-fetching-error.ts | ~70 | 89 | OK |
| error/handlers.ts | ~290 | 403 | OVER |
| date.ts (barrel) | ~30 | 26 | OK |
| date/date-constants.ts | ~200 | 206 | OK |
| date/timezone.ts | ~180 | 220 | OK |
| date/formatters.ts | ~250 | 270 | OK |

3/13 files exceed target. Causes:
- `auth-store.ts` (322): constructor's onAuthStateChange listener kept inline
- `auth-store-profile.ts` (249): profile mapping + dev fallback more verbose than estimated
- `error/handlers.ts` (403): JSDoc comments and 6 classes/utilities in one module

---

## Symbol Preservation

### auth-store (1 consumer: auth-provider.tsx)
- `AuthStore` class: PASS (direct export)
- `AuthContextType` type: PASS (re-exported from auth-store-types.ts)

### error.ts barrel (11 consumers)
All 21 exported symbols re-exported. Verified consumers:
- global-error.tsx, api-error-handler.ts, logger.ts, server-action-error-handler.ts, retry.ts
- ErrorContext.tsx, useVoteSubmit.ts, useRetryableQuery.ts, useVoteResults.ts
- ErrorBoundary.tsx, GlobalErrorDisplay.tsx

**Zero symbol loss.**

### date.ts barrel (7 consumers)
All 16 exported symbols re-exported. Verified consumers:
- useLanguage.ts, OngoingVoteItems.tsx, utils.ts (server), VoteCard.tsx
- notice/page.tsx, NoticeDetailClient.tsx, NoticePageClient.tsx

**Zero symbol loss.**

---

## Circular Dependencies

All three module graphs verified — **no circular dependencies**.

---

## Hard Constraints

| Constraint | Status |
|------------|:------:|
| Behavior-preserving | PASS |
| No public API changes | PASS |
| No new dependencies | PASS |
| No circular dependencies | PASS |

---

## Gaps Found

| Priority | Item | File | Impact |
|----------|------|------|--------|
| Low | auth-store.ts 322줄 (target 200) | auth-store.ts | Constructor logic more verbose than estimated |
| Low | handlers.ts 403줄 (target 290) | error/handlers.ts | Could split ErrorTransformer into own file |
| Low | Dead `getLocaleString` export | date-constants.ts:200 | Not used externally |

---

## Conclusion

**95% match rate — PASS.** All critical success criteria met. Line count overages are cosmetic and do not affect behavior or maintainability. Implementation is ready for report and archive.

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-04 | Initial gap analysis |
