# weekly-refactor-batch15 Analysis Report

> **Feature**: Dead Code Removal (Batch 15)
> **Match Rate**: 100%
> **Date**: 2026-03-08
> **Commit**: ac053d1a

## Gap Analysis

| # | File | Lines | Import Count | Status |
|---|------|------:|:---:|:---:|
| 1 | `utils/webWorker.ts` | 388 | 0 | Deleted |
| 2 | `utils/api-error-handler.ts` | 348 | 0 | Deleted |
| 3 | `utils/performance.ts` | 340 | 0 | Deleted |
| 4 | `utils/server-action-error-handler.ts` | 333 | 0 | Deleted |
| 5 | `components/ui/animations/VoteAnimations.tsx` | 392 | 0 | Deleted |
| 6 | `components/debug/PerformanceMonitor.tsx` | 295 | 0 | Deleted |
| 7 | `utils/api/serverQueries.ts` | 133 | 0 | Deleted |
| 8 | `utils/api/hydration-safe-data.ts` | 124 | 0 | Deleted |
| 9 | `utils/navigation-loading.ts` | 64 | 0 | Deleted |
| 10 | `utils/global-timer.ts` | 50 | 0 | Deleted |
| 11 | `utils/vote.ts` | 10 | 0 | Deleted |

## Verification

| Check | Result |
|-------|--------|
| Source imports to deleted files | 0 |
| Barrel re-exports of deleted files | 0 |
| `npm run build` | Success |

## Score

| Category | Score |
|----------|:-----:|
| Design Match | 100% |
| Build Integrity | 100% |
| Architecture | 100% |
| Convention | 100% |
| Documentation | 90% (stale refs in error-logging-guide.md) |
| **Overall** | **98%** |

## Stale References (Low Priority)

- `docs/error-logging-guide.md` L118,131,162,180: 삭제된 파일 참조 (docs only, 런타임 영향 없음)
