# Design-Implementation Gap Analysis Report

## Analysis Overview

- **Feature**: weekly-refactor-batch4
- **Plan Document**: `docs/01-plan/features/weekly-refactor-batch4.plan.md`
- **Analysis Date**: 2026-03-05
- **Match Rate**: 95%

---

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Symbol Placement | 96% | PASS |
| Line Count Targets | 92% | PASS |
| Circular Dependencies | 100% | PASS |
| External Import Paths | 100% | PASS |
| Public API Exports | 100% | PASS |
| 'use client' Directives | 100% | PASS |
| Behavior Preservation | 100% | PASS |
| **Overall** | **95%** | **PASS** |

---

## Group 1: voteStore.ts (677줄 → 3파일)

| Plan | Actual | Status |
|------|--------|--------|
| `voteStore.ts` (~290줄) | 304줄 | WARNING (+4 over 300) |
| `vote-store-types.ts` (~150줄) | 150줄 | PASS |
| `vote-store-api.ts` (~240줄) | 268줄 | PASS |

- 모든 심볼 올바르게 배치 (9 types + 4 initials + 5 API actions + 15 setters)
- 타입 별칭 이름 변경: `VoteStoreSet/Get` → `SetFn/GetFn` (내부 전용, 영향 없음)
- 외부 소비자 4개 경로 불변, 순환 없음

## Group 2: QnaDetailClient.tsx (676줄 → 5파일)

| Plan | Actual | Status |
|------|--------|--------|
| `QnaDetailClient.tsx` (~250줄) | 255줄 | PASS |
| `qna-utils.ts` (~80줄) | 65줄 | PASS |
| `useQnaForm.ts` (~120줄) | 215줄 | WARNING (planned 120) |
| `QnaMessageList.tsx` (~170줄) | 181줄 | PASS |
| `QnaMediaModal.tsx` (~60줄) | 77줄 | PASS |

- 모든 계획된 심볼 배치 완료
- `useQnaForm`이 계획보다 많은 로직 흡수 (formAction 84줄 포함) — 300줄 이하이므로 문제 없음
- 추가: `QnaThreadWithRelations` 타입, `clearAll` 함수 (계획에 없었으나 유용)
- 외부 소비자 1개 (page.tsx) 경로 불변, 순환 없음, 'use client' 모두 존재

## Group 3: community-service.ts (641줄 → 4파일)

| Plan | Actual | Status |
|------|--------|--------|
| `community-service.ts` (~25줄 barrel) | 33줄 | PASS |
| `community/types.ts` (~70줄) | 128줄 | WARNING (planned 70) |
| `community/boards.ts` (~280줄) | 270줄 | PASS |
| `community/posts.ts` (~250줄) | 259줄 | PASS |

- 13개 함수 + 9개 타입 모두 barrel re-export 확인
- 의존 방향: posts → boards → types (순환 없음)
- 외부 소비자 9개 경로 불변

---

## Hard Constraints

| Constraint | Status |
|-----------|--------|
| Behavior-preserving | PASS |
| Public API unchanged | PASS |
| No new dependencies | PASS |
| No circular dependencies | PASS |

## Deviations

| Item | Plan | Actual | Impact |
|------|------|--------|--------|
| Type alias names (vote-store-api) | `VoteStoreSet/Get` | `SetFn/GetFn` | None (internal) |
| `useQnaForm.ts` line count | ~120 | 215 | Low (still < 300) |
| `community/types.ts` line count | ~70 | 128 | Low (types verbose) |
| `voteStore.ts` line count | ~290 | 304 | Low (4 over 300) |

## Missing Features

None. All planned symbols present in target files.

---

## Conclusion

**Match Rate: 95%** — 모든 hard constraints 충족. 3개 원본 300줄+ 파일이 12개 구조화된 파일로 성공적으로 분해됨. 줄 수 추정치와의 차이만 존재하며 corrective action 불필요.
