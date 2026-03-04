# Gap Analysis: weekly-refactor-batch9

## Overall Match Rate: 95% — PASS

## Hard Constraints

| Constraint | Result |
|---|---|
| All files under 300 lines | PASS (max 295: VoteCard.tsx) |
| No circular dependencies | PASS (all unidirectional) |
| Barrel re-exports preserve external imports | PASS (3 consumers unaffected) |
| `export default VoteCard` maintained | PASS |
| `export async function POST` maintained | PASS |
| `'use client'` in all animation files | PASS (3/3) |
| No new dependencies | PASS |

## Line Count Comparison

| File | Plan | Actual | Delta | Under 300? |
|---|:---:|:---:|:---:|:---:|
| portone/webhook/route.ts | ~280 | 272 | -8 | PASS |
| portone/webhook/webhook-helpers.ts | ~170 | 251 | +81 | PASS |
| RealtimeAnimations.tsx | ~120 | 133 | +13 | PASS |
| AnimatedVoteComponents.tsx | ~190 | 240 | +50 | PASS |
| ConnectionStatus.tsx | ~90 | 92 | +2 | PASS |
| VoteCard.tsx | ~250 | 294 | +44 | PASS |
| vote-card-utils.ts | ~180 | 172 | -8 | PASS |

## Differences

### Added symbols (not in plan)
1. `parseCustomData()` in webhook-helpers.ts — customData 파싱 추출 (개선)
2. `processStarCandyBonus()` in webhook-helpers.ts — 보너스 처리 추출 (개선)
3. `VoteStatus` type in vote-card-utils.ts — 필수 TypeScript 타입
4. `VoteTimeInfo` interface in vote-card-utils.ts — 타이머 상태 타입
5. `CATEGORY_LABEL_FALLBACK` in vote-card-utils.ts — 인라인→상수 추출
6. `SUBCATEGORY_LABEL_FALLBACK` in vote-card-utils.ts — 인라인→상수 추출

### Changed function signatures
| Function | Plan | Actual | Reason |
|---|---|---|---|
| `computeVoteStatus` | `(vote)` | `(startAt, stopAt, referenceTime)` | 세분화 |
| `computeTimeLeft` | `(endDate)` | `(status, startAt, stopAt, referenceTime)` | 세분화 |
| `getStatusText` | `(status)` | `(status, t)` | i18n 지원 |
| `getCategoryLabel` | `(category)` | `(category, t)` | i18n 지원 |
| `getSubCategoryLabel` | `(subCategory)` | `(subCategory, t)` | i18n 지원 |

### Missing items: None

## External Import Preservation — All PASS

- VoteBalanceDisplay.tsx → `@/components/ui/animations/RealtimeAnimations` ✓
- VoteRankCard.tsx → `@/components/ui/animations/RealtimeAnimations` ✓
- VoteRankCardAnimated.tsx → `@/components/ui/animations/RealtimeAnimations` ✓
- VoteListPresenter.tsx → `./VoteCard` (default) ✓
- vote/index.ts → `./list/VoteCard` (re-export) ✓

## Watchlist

VoteCard.tsx (294줄) — 300줄 한계 근접. 추가 기능 시 `useVoteTimer` 훅 추출 권장.
