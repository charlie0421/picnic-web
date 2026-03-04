# Weekly Refactor Batch 12 — Gap Analysis

## Match Rate: 88%

## Matches

- **파일 구조**: 3개 신규 파일 생성 — 계획대로
- **줄 수 제한**: 모든 6개 파일 300줄 이하 (226, 263, 189, 208, 186, 213)
- **'use client' / 'server-only'**: VoteDetailPresenter에 'use client', useVoteDetail에 없음, vote-service-query에 'server-only' — 정확
- **공개 API 보존**: VoteDetailPresenterProps re-export, export default, getVotes/getVoteById/getVoteDetails, PerformanceMetrics barrel re-export — 모두 유지
- **순환 의존 없음**: 3개 파일쌍 모두 단방향 의존
- **새 의존성 없음**: 기존 패키지만 사용
- **동작 보존**: 로직 변경 없음

## Gaps

| # | Gap | 영향 | 심각도 |
|---|-----|------|--------|
| 1 | useVoteDetail.ts 263줄 (계획 ~160) | 300줄 hard limit 이내 | Medium |
| 2 | renderTimer가 훅 대신 컴포넌트에 정의 | JSX는 .tsx에 배치가 적절 — 합리적 편차 | Low |
| 3 | handleCardClick/confirmVote 배치 — 계획 문구 모호 | 훅 심볼 맵을 따름 — 일관성 있음 | Low |
| 4 | VoteOrderConfig 미export (계획과 다름) | 외부 consumer 없음 — 영향 없음 | Low |
| 5 | consumer 수 과대 추정 | 코드 영향 없음 | Low |
| 6 | useCallback 미사용 import | lint 경고만 | Low |

## 검증 결과

| 항목 | 결과 |
|------|------|
| TypeScript (`tsc --noEmit`) | 기존 에러만 |
| 빌드 (`VERCEL=1 npm run build`) | 컴파일 성공 6.4s |
| 순환 의존 (`madge --circular`) | 없음 |
| 줄 수 제한 (300줄) | 모든 파일 통과 |

## 파일별 줄 수

| File | Before | After | New File | New Lines |
|------|--------|-------|----------|-----------|
| VoteDetailPresenter.tsx | 386 | 226 | useVoteDetail.ts | 263 |
| vote-service.ts | 385 | 189 | vote-service-query.ts | 208 |
| enhanced-retry-utils.ts | 381 | 186 | enhanced-retry-internals.ts | 213 |
| **Total** | **1,152** | **601** | — | **684** |
