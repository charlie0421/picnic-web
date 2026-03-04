# Gap Analysis: weekly-refactor-batch10

## Overall Match Rate: 97% — PASS (series best)

## Hard Constraints

| Constraint | Result |
|---|---|
| All files under 300 lines | PASS (max 293: useBannerCarousel.ts) |
| No circular dependencies | PASS (all unidirectional) |
| Barrel re-exports preserve external imports | PASS |
| `export default BannerCarouselClient` maintained | PASS |
| `import 'server-only'` in both user-service files | PASS |
| RetryUtility errorTransformer param (circular dep prevention) | PASS |
| No new dependencies | PASS |

## Line Count Comparison

| File | Plan | Actual | Delta | Under 300? |
|---|:---:|:---:|:---:|:---:|
| BannerCarouselClient.tsx | ~220 | 194 | -26 | PASS |
| useBannerCarousel.ts | ~210 | 293 | +83 | PASS |
| user-service.ts | ~210 | 268 | +58 | PASS |
| user-service-vote-history.ts | ~200 | 160 | -40 | PASS |
| error/handlers.ts | ~230 | 289 | +59 | PASS |
| error-retry.ts | ~120 | 170 | +50 | PASS |

## Differences

### Minor deviations (no impact)
1. `isVisible` in plan's return list but correctly kept internal in hook
2. `maxIndex` returned by hook but not in plan (harmless extra)
3. `UseBannerCarouselReturn` interface added (plan didn't mention — positive improvement)
4. `defaultTransformError` private method in error-retry.ts (makes RetryUtility standalone-usable)

### Missing items: None
### Violations: None

## External Import Preservation — All PASS

- BannerListPresenter.tsx → `./BannerCarouselClient` ✓
- vote-history/page.tsx → `@/lib/data-fetching/server/user-service` ✓
- posts/page.tsx → `@/lib/data-fetching/server/user-service` ✓
- comments/page.tsx → `@/lib/data-fetching/server/user-service` ✓
- recharge-history/page.tsx → `@/lib/data-fetching/server/user-service` ✓
- utils/error.ts → `./error/handlers` ✓

## Circular Dependency Prevention

RetryUtility.withRetry accepts optional `errorTransformer` callback.
ErrorHandler.wrapWithRetry passes `ErrorTransformer.fromUnknownError` to avoid error-retry → handlers cycle.

## Watchlist

- useBannerCarousel.ts (293줄) — 300줄 한계 근접
- hooks/useBannerCarousel.ts (기존 112줄) — 동명 훅 존재, 향후 정리 권장
