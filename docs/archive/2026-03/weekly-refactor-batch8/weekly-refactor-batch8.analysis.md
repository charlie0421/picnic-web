# weekly-refactor-batch8 Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation)
>
> **Project**: picnic-web
> **Analyst**: Claude Code (gap-detector)
> **Date**: 2026-03-04
> **Plan Doc**: [weekly-refactor-batch8.plan.md](../01-plan/features/weekly-refactor-batch8.plan.md)

---

## 1. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| File Structure | 100% (9/9) | PASS |
| Symbol Placement | 97.8% (45/46) | PASS |
| Hard Constraints | 100% (6/6) | PASS |
| Consumer API | 100% | PASS |
| Line Count (all under 300) | 100% (9/9) | PASS |
| **Overall Match Rate** | **96%** | **PASS** |

---

## 2. Line Count Comparison

| File | Plan Target | Actual | Under 300 |
|------|:-----------:|:------:|:---------:|
| auth-redirect.ts (barrel) | ~200 | 152 | Yes |
| auth-redirect-validators.ts | ~100 | 175 | Yes |
| auth-redirect-storage.ts | ~140 | 170 | Yes |
| VoteRankCard.tsx | ~200 | 220 | Yes |
| VoteRankCardAnimated.tsx | ~210 | 258 | Yes |
| vote-rank-card-utils.ts | ~70 | 78 | Yes |
| concert2025/page.tsx | ~200 | 262 | Yes |
| concert2025-data.ts | ~100 | 95 | Yes |
| Concert2025Guide.tsx | ~130 | 130 | Yes |

---

## 3. Hard Constraints

| Constraint | Status |
|------------|:------:|
| Behavior-preserving | PASS |
| No public API changes | PASS |
| No new dependencies | PASS |
| No circular dependencies | PASS |
| All main files under 300 lines | PASS |
| Build compiles (7.0s) | PASS |

---

## 4. Minor Deviations

1. **validators.ts 175줄 (목표 ~100)**: `normalizeRedirectPath` 54줄 이동으로 증가 — 순환 의존성 방지를 위한 계획된 조치
2. **VoteRankCardAnimated 자체 Props 정의**: `VoteRankCardProps` 재사용 대신 `VoteRankCardAnimatedProps` 정의 — 계산된 props에 더 적합
3. **concert2025-data.ts 추가 export 3개**: `postersBySlugNormalized`, `postersFlat`, `firstPosterSrc` — page.tsx 간소화에 기여
4. **page.tsx 262줄 (목표 ~200)**: CN 전용 섹션 유지로 인한 증가 — 300줄 이하 유지

---

## 5. Verdict

**Match Rate: 96% — PASS**. 모든 편차는 개선 방향. 코드 변경 불필요.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-04 | Initial gap analysis |
