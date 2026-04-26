# Gap Analysis: weekly-refactor-batch6

> **Summary**: Design-implementation gap analysis for the decomposition of 3 large files (retry.ts, error.tsx, VoteDialog.tsx) into 11 smaller modules.
>
> **Author**: gap-detector
> **Created**: 2026-03-04
> **Status**: Review

---

## Summary
- Match Rate: 93%
- Files Analyzed: 11
- Gaps Found: 1 (error.tsx exceeds 300-line main file limit by 13 lines)

## File Structure Comparison

All 11 planned files exist with the correct names and locations.

### 1. retry.ts decomposition (506 lines -> 4 files)

| File | Planned Lines | Actual Lines | Limit | Status |
|------|:------------:|:------------:|:-----:|:------:|
| `utils/retry.ts` (barrel) | ~50 | 39 | <300 (main) | PASS |
| `utils/retry-types.ts` | ~110 | 107 | <250 (extracted) | PASS |
| `utils/retry-core.ts` | ~200 | 209 | <250 (extracted) | PASS |
| `utils/retry-wrappers.ts` | ~160 | 219 | <250 (extracted) | PASS |
| **Subtotal** | **~520** | **574** | | |

### 2. error.tsx decomposition (504 lines -> 3 files)

| File | Planned Lines | Actual Lines | Limit | Status |
|------|:------------:|:------------:|:-----:|:------:|
| `app/[lang]/error.tsx` (main) | ~230 | 313 | <300 (main) | **FAIL (+13)** |
| `app/[lang]/error-data.ts` | ~155 | 152 | <250 (extracted) | PASS |
| `app/[lang]/ErrorDecorations.tsx` | ~120 | 72 | <250 (extracted) | PASS |
| **Subtotal** | **~505** | **537** | | |

### 3. VoteDialog.tsx decomposition (495 lines -> 4 files)

| File | Planned Lines | Actual Lines | Limit | Status |
|------|:------------:|:------------:|:-----:|:------:|
| `components/client/vote/dialogs/VoteDialog.tsx` (main) | ~180 | 228 | <300 (main) | PASS |
| `components/client/vote/dialogs/useVoteDialog.ts` | ~120 | 174 | <250 (extracted) | PASS |
| `components/client/vote/dialogs/VoteDialogOverlays.tsx` | ~100 | 91 | <250 (extracted) | PASS |
| `components/client/vote/dialogs/VoteBalanceDisplay.tsx` | ~130 | 131 | <250 (extracted) | PASS |
| **Subtotal** | **~530** | **624** | | |

## Detailed Findings

### Gap 1: error.tsx exceeds 300-line main file limit

- **Planned**: ~230 lines
- **Actual**: 313 lines (exceeds 300-line hard constraint by 13 lines)
- **Impact**: Medium
- **Root Cause**: The inline style objects and hover event handlers in the JSX (each button consumes ~20 lines of style + mouse event handlers) were larger than estimated.
- **Recommended Fix**: Extract the three action buttons (retry, home, back) into a small `ErrorActions.tsx` component (~80 lines), bringing `error.tsx` under 300 lines.

### Observation 1: Barrel export style differs (not a gap)

- **Planned**: `export * from './retry-types'` and `export * from './retry-wrappers'`
- **Actual**: Explicit named exports with separate `export type` blocks
- **Impact**: None -- functionally equivalent, arguably better practice
- **Assessment**: Intentional improvement. No action needed.

### Observation 2: useVoteDialog returns `t` (translation function)

- **Planned**: Return value list did not explicitly include `t`
- **Actual**: Hook returns `t` from `useLanguageStore` for sub-components
- **Impact**: None -- necessary addition implicitly required by the design
- **Assessment**: No action needed.

## Symbol Placement Verification

### retry-types.ts
- [x] `RetryStrategy` enum
- [x] `RetryCondition` type
- [x] `ExtendedRetryConfig` interface
- [x] `RetryResult<T>` interface
- [x] 4 preset configs (DEFAULT, NETWORK, DATABASE, EXTERNAL_API)

### retry-core.ts
- [x] `ExtendedRetryUtility` class (withRetry, shouldRetry, calculateDelay, sleep)

### retry-wrappers.ts
- [x] 3 wrapper functions (withNetworkRetry, withDatabaseRetry, withExternalApiRetry)
- [x] `createRetryCondition` factory (httpStatus, errorMessage, maxAttempts, and, or)
- [x] `withAutoRetry` decorator
- [x] `useRetryableOperation` React hook
- [x] `withServerActionRetry`, `withBatchRetry`

### error-data.ts
- [x] `languages` (12 languages), `translations` (12x8), `Language` type, `ErrorPageProps`

### ErrorDecorations.tsx
- [x] `<style jsx>` with 4 animations, 6 circles, 5 emojis, children prop

### useVoteDialog.ts
- [x] `UserBalance`, `fetcher`, 5 useState, SWR, handlers, `getLocale`

### VoteDialogOverlays.tsx / VoteBalanceDisplay.tsx
- [x] All overlays and 4 balance states correctly placed

## Compliance Check

- [ ] All main files under 300 lines -- **FAIL: error.tsx is 313 lines**
- [x] All extracted files under 250 lines -- PASS (max: retry-wrappers.ts at 219)
- [x] External import paths preserved -- PASS (6 consumers verified)
- [x] No circular dependencies -- PASS
- [x] No new dependencies -- PASS
- [x] export default preserved -- PASS (error.tsx, VoteDialog.tsx)

## Overall Match Rate: 93%

## Related Documents
- Plan: [weekly-refactor-batch6.plan.md](../01-plan/features/weekly-refactor-batch6.plan.md)
