# Weekly Refactor Batch 11 — Gap Analysis

## Match Rate: 92%

## Matches

- **파일 구조**: 3개 신규 파일 생성 (`client-internals.ts`, `useGoongHapList.ts`, `verify-helpers.ts`) — 계획대로
- **줄 수 제한**: 모든 6개 파일 300줄 이하 (203, 269, 247, 182, 141, 225)
- **'use client' 지시문**: client.ts/client-internals.ts에 'use client' 있음, useGoongHapList.ts에 없음 — 정확
- **공개 API 보존**: 14개 consumer의 import 경로 변경 없음, Next.js 라우팅/API 계약 유지
- **순환 의존 방지**: signOut 콜백 setter 주입 패턴 정확히 구현
- **DRY 개선**: `buildReceiptResponse` 헬퍼로 중복 영수증 로직 제거 (~60줄 절감)
- **심볼 이동**: 모든 심볼이 계획된 파일에 정확히 배치됨
- **새 의존성 없음**: 기존 패키지만 사용
- **동작 보존**: 리팩터링으로 인한 동작 변경 없음

## Gaps

| # | Gap | 영향 | 심각도 |
|---|-----|------|--------|
| 1 | verify-helpers.ts 줄 수 225줄 (계획 ~180) | 300줄 hard limit 이내 | Low |
| 2 | route.ts 줄 수 141줄 (계획 ~220) — DRY 효과가 예상보다 큼 | 긍정적 편차 | Low |
| 3 | useGoongHapList 훅이 추가 필드 반환 (userProfile, isAuthenticated, authLoading, currentLocale) | page.tsx에서 필요, 합리적 확장 | Low |
| 4 | setter 함수 패턴 (setBrowserSupabase, setIsCreatingClient) — 계획의 직접 export let 대신 | ES 모듈 best practice, 더 안전한 패턴 | Low (긍정적) |

## 검증 결과

| 항목 | 결과 |
|------|------|
| TypeScript (`tsc --noEmit`) | 기존 에러만 (supabase.ts) |
| 빌드 (`VERCEL=1 npm run build`) | 컴파일 성공 6.5s |
| 순환 의존 (`madge --circular`) | 없음 |
| 줄 수 제한 (300줄) | 모든 파일 통과 |

## 파일별 줄 수

| File | Before | After | New File | New Lines |
|------|--------|-------|----------|-----------|
| supabase/client.ts | 413 | 203 | client-internals.ts | 269 |
| goong-hap/page.tsx | 396 | 247 | useGoongHapList.ts | 182 |
| portone/verify/route.ts | 394 | 141 | verify-helpers.ts | 225 |
| **Total** | **1,203** | **591** | — | **676** |
