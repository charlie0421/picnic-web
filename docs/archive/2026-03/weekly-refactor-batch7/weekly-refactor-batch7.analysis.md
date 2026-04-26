# weekly-refactor-batch7 Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation)
>
> **Project**: picnic-web
> **Analyst**: Claude Code (gap-detector)
> **Date**: 2026-03-04
> **Plan Doc**: [weekly-refactor-batch7.plan.md](../01-plan/features/weekly-refactor-batch7.plan.md)

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

Verify that the implementation of weekly-refactor-batch7 (decomposition of 3 large files: queries.ts, logger.ts, not-found.tsx) matches the plan document specifications.

### 1.2 Analysis Scope

- **Plan Document**: `docs/01-plan/features/weekly-refactor-batch7.plan.md`
- **Implementation Files**: 11 files across `utils/api/`, `utils/`, and `app/`

---

## 2. Gap Analysis

### 2.1 File Structure (11/11 = 100%)

All 11 planned files exist with correct names and locations.

### 2.2 Line Count Comparison

| File | Plan Target | Actual | Delta | Within Tolerance |
|------|:-----------:|:------:|:-----:|:----------------:|
| `queries.ts` (barrel) | ~40 | 14 | -26 | No (smaller) |
| `queries-helpers.ts` | ~65 | 63 | -2 | Yes |
| `queries-vote.ts` | ~220 | 207 | -13 | Yes |
| `queries-content.ts` | ~175 | 222 | +47 | No (+27%) |
| `logger.ts` | ~190 | 207 | +17 | Yes |
| `logger-types.ts` | ~60 | 56 | -4 | Yes |
| `logger-targets.ts` | ~120 | 126 | +6 | Yes |
| `logger-utils.ts` | ~120 | 124 | +4 | Yes |
| `not-found.tsx` | ~250 | 292 | +42 | No (+17%) |
| `not-found-data.ts` | ~125 | 121 | -4 | Yes |
| `GlobalNotFoundDecorations.tsx` | ~105 | 91 | -14 | Yes |

**Line Count Score: 8/11 within tolerance (73%)**

### 2.3 Symbol Placement (66/67 = 98.5%)

All symbols correctly placed except 1: `logger.ts` barrel does NOT re-export from `./logger-utils` (intentional — prevents circular dependency).

### 2.4 Hard Constraints (5/5 = 100%)

| Constraint | Status |
|------------|:------:|
| Behavior-preserving | PASS |
| No public API changes | PASS |
| No new dependencies | PASS |
| No circular dependencies | PASS |
| All main files under 300 lines | PASS |

### 2.5 Consumer API Preservation (100%)

- 9 queries consumers: unchanged
- 7 logger consumers: 6 unchanged, 1 updated to import from `@/utils/logger-utils`
- `app/not-found.tsx`: `export default` preserved

---

## 3. Gaps Found

### GAP-1: Missing barrel re-export from logger-utils (Medium)

- **Plan**: `logger.ts` should barrel re-export from `./logger-utils`
- **Actual**: Omitted to prevent circular dependency (`logger.ts -> logger-utils.ts -> logger.ts`)
- **Impact**: `api-error-handler.ts` imports `createRequestLogger` directly from `@/utils/logger-utils`
- **Assessment**: Deliberate, correct deviation

### GAP-2: Double withRetry on _getRewards (Low)

- Inner retry in `queries-content.ts` + outer retry in barrel `queries.ts`
- Pre-existing behavior preserved (behavior-preserving constraint)

### GAP-3: queries-content.ts larger than planned (Low)

- Plan: ~175, Actual: 222 (+27%). Detailed error logging not in estimate.

### GAP-4: not-found.tsx larger than planned (Low)

- Plan: ~250, Actual: 292 (+17%). SSR fallback UI not in estimate.

---

## 4. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| File Structure | 100% | PASS |
| Symbol Placement | 98.5% | PASS |
| Hard Constraints | 100% | PASS |
| Consumer API | 100% | PASS |
| Line Count Accuracy | 73% | ACCEPTABLE |
| **Overall Match Rate** | **94%** | **PASS** |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-04 | Initial gap analysis |
